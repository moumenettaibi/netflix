import os
import json
import uuid
import atexit
import re
import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
from datetime import timedelta, date, datetime
from urllib.parse import urlparse

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# Flask-Login Configuration
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'

SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'a-strong-dev-secret-key-that-is-not-so-secret')
app.secret_key = SECRET_KEY

# Set the session to last for one year
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=365)

# Database Connection Pool
def _with_neon_endpoint_option(dsn: str) -> str:
    """If connecting to Neon and libpq lacks SNI, append options=endpoint%3D<endpoint-id>.
    Works for URL-style DSNs (postgres:// or postgresql://).
    """
    if not isinstance(dsn, str):
        return dsn
    try:
        if 'neon.tech' not in dsn:
            return dsn
        if 'endpoint%3D' in dsn:  # already present
            return dsn
        parsed = urlparse(dsn)
        host = parsed.hostname or ''
        if not host:
            return dsn
        endpoint_id = host.split('.')[0]
        if not endpoint_id:
            return dsn
        sep = '&' if '?' in dsn else '?'
        return f"{dsn}{sep}options=endpoint%3D{endpoint_id}"
    except Exception:
        return dsn

try:
    raw_dsn = os.environ.get('POSTGRES_URL')
    if not raw_dsn:
        raise RuntimeError("POSTGRES_URL environment variable is not set.")
    dsn = _with_neon_endpoint_option(raw_dsn)
    pool = SimpleConnectionPool(
        minconn=1,
        maxconn=10,
        dsn=dsn
    )
except psycopg2.OperationalError as e:
    raise RuntimeError(f"Could not connect to the database. Check your POSTGRES_URL. Error: {e}")

@atexit.register
def close_pool():
    if pool:
        pool.closeall()
        print("Database connection pool closed.")

@contextmanager
def get_db_connection():
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)

# Database Schema Migration
def run_migrations():
    """Ensure base schema and feature tables for My Netflix data."""
    required_columns = {
        'id': "UUID PRIMARY KEY",
        'username': "TEXT UNIQUE NOT NULL",
        'password_hash': "TEXT NOT NULL",
        'email': "TEXT",
        'created_at': "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"
    }

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            print("Checking database schema...")

            # Create table if missing with minimal schema
            cur.execute("""
                SELECT 1 FROM information_schema.tables
                WHERE table_name='users';
            """)
            if cur.fetchone() is None:
                cols_sql = ",\n                        ".join([f"{name} {ddl}" for name, ddl in required_columns.items()])
                cur.execute(f"""
                    CREATE TABLE users (
                        {cols_sql}
                    );
                """)
                print(" -> Created 'users' table with minimal schema.")
            else:
                # Drop extra columns if they exist
                cur.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name='users';
                """)
                existing = {row[0] for row in cur.fetchall()}
                to_drop = [c for c in existing if c not in required_columns]
                for col in to_drop:
                    cur.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {col};")
                    print(f" -> Dropped extra column 'users.{col}'.")

                # Ensure required columns exist
                for name, ddl in required_columns.items():
                    if name not in existing:
                        cur.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl};")
                        print(f" -> Added missing column 'users.{name}'.")

            # Create my_list table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS my_list (
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    tmdb_id BIGINT NOT NULL,
                    media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
                    data JSONB,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, media_type, tmdb_id)
                );
            """)

            # Create likes table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS likes (
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    tmdb_id BIGINT NOT NULL,
                    media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
                    data JSONB,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, media_type, tmdb_id)
                );
            """)

            # Create trailers_watched table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS trailers_watched (
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    tmdb_id BIGINT NOT NULL,
                    media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
                    data JSONB,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, media_type, tmdb_id)
                );
            """)

            conn.commit()
            print("Schema check complete (users, my_list, likes, trailers_watched).")

run_migrations()

class User(UserMixin):
    def __init__(self, id, username, password_hash, email=None):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.email = email

def get_user_by_username(username):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, username, password_hash, email FROM users WHERE username = %s;", (username,))
            user_data = cur.fetchone()
            if user_data:
                return User(id=user_data['id'], username=user_data['username'], password_hash=user_data['password_hash'], email=user_data.get('email'))
    return None

def get_user_by_id(user_id):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, username, password_hash, email FROM users WHERE id = %s;", (user_id,))
            user_data = cur.fetchone()
            if user_data:
                return User(id=user_data['id'], username=user_data['username'], password_hash=user_data['password_hash'], email=user_data.get('email'))
    return None

def get_user_by_email(email):
    if not email:
        return None
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, username, password_hash, email FROM users WHERE LOWER(email) = LOWER(%s);", (email,))
            user_data = cur.fetchone()
            if user_data:
                return User(id=user_data['id'], username=user_data['username'], password_hash=user_data['password_hash'], email=user_data.get('email'))
    return None

@login_manager.user_loader
def load_user(user_id):
    return get_user_by_id(user_id)

# Authentication Routes
@app.route('/login', methods=['GET', 'POST'])
def login_page():
    if request.method == 'POST':
        data = request.get_json() or {}
        identifier = (data.get('identifier')
                      or data.get('username')
                      or data.get('email'))
        password = data.get('password')

        user = None
        if identifier:
            # Try username first, then email
            user = get_user_by_username(identifier) or get_user_by_email(identifier)
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            session.permanent = True
            return jsonify({'success': True, 'message': 'Logged in successfully!', 'redirect': '/browse'})
        return jsonify({'success': False, 'message': 'Invalid username or password.'}), 401
    return render_template('auth/login.html')

@app.route('/signup', methods=['GET'])
def signup_page():
    return render_template('auth/signup.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    email = (data.get('email') or '').strip()

    if not email or not password:
        return jsonify({'success': False, 'message': 'Email and password are required.'}), 400

    # Derive username from email if not provided
    if not username:
        base = email.split('@')[0]
        candidate = base or 'user'
        suffix = 1
        while get_user_by_username(candidate):
            candidate = f"{base}{suffix}"
            suffix += 1
        username = candidate
    else:
        if get_user_by_username(username):
            return jsonify({'success': False, 'message': 'Username already exists.'}), 409

    new_user_id = str(uuid.uuid4())
    hashed_password = generate_password_hash(password)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, username, password_hash, email) VALUES (%s, %s, %s, %s);",
                (new_user_id, username, hashed_password, email)
            )
        conn.commit()

    new_user = get_user_by_id(new_user_id)
    login_user(new_user)
    session.permanent = True
    return jsonify({'success': True, 'message': 'Registration successful!', 'redirect': '/browse'})

@app.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'success': True, 'message': 'Logged out successfully.', 'redirect': '/'})

# Root route - redirect to browse
@app.route("/")
def index():
    return redirect("/browse")

# Home route serving your index.html
@app.route("/browse")
@login_required
def home():
    return render_template("index.html", username=current_user.username)

# My Netflix route
@app.route("/my-netflix")
@login_required
def my_netflix():
    user_id = _uuid_str(current_user.id)
    initial_payload = {
        'myList': _load_user_collection('my_list', user_id),
        'likes': _load_user_collection('likes', user_id),
        'trailers': _load_user_collection('trailers_watched', user_id)
    }
    return render_template("my-netflix.html", initial_payload=initial_payload, username=current_user.username)

# --- My Netflix API ---
def _uuid_str(u):
    return str(u) if isinstance(u, uuid.UUID) else u

def _load_user_collection(table_name: str, user_id: str):
    if table_name not in {'my_list', 'likes', 'trailers_watched'}:
        raise ValueError("Invalid collection table requested")

    sql = f"""
        SELECT tmdb_id, media_type, COALESCE(data, '{{}}'::jsonb) AS data
        FROM {table_name}
        WHERE user_id = %s
        ORDER BY created_at DESC
    """

    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (user_id,))
            rows = cur.fetchall()

    items = []
    for row in rows:
        payload = row['data'] or {}
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}

        try:
            payload['id'] = int(row['tmdb_id'])
        except (TypeError, ValueError):
            payload['id'] = row['tmdb_id']
        payload['media_type'] = row['media_type']
        items.append(payload)

    return items

@app.route('/api/me/my-list', methods=['GET', 'POST', 'DELETE'])
@login_required
def api_my_list():
    user_id = _uuid_str(current_user.id)
    if request.method == 'GET':
        return jsonify(_load_user_collection('my_list', user_id))

    payload = request.get_json() or {}
    tmdb_id = payload.get('tmdb_id')
    media_type = (payload.get('media_type') or '').lower()
    data = payload.get('data')
    if not tmdb_id or media_type not in {'movie','tv'}:
        return jsonify({'error': 'tmdb_id and valid media_type required'}), 400

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if request.method == 'POST':
                cur.execute(
                    """
                    INSERT INTO my_list (user_id, tmdb_id, media_type, data)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id, media_type, tmdb_id)
                    DO UPDATE SET data = EXCLUDED.data, created_at = CURRENT_TIMESTAMP
                    """,
                    (user_id, tmdb_id, media_type, json.dumps(data) if data is not None else None)
                )
            else:  # DELETE
                cur.execute(
                    "DELETE FROM my_list WHERE user_id = %s AND tmdb_id = %s AND media_type = %s",
                    (user_id, tmdb_id, media_type)
                )
        conn.commit()
    return jsonify({'success': True})

@app.route('/api/me/likes', methods=['GET', 'POST', 'DELETE'])
@login_required
def api_likes():
    user_id = _uuid_str(current_user.id)
    if request.method == 'GET':
        return jsonify(_load_user_collection('likes', user_id))

    payload = request.get_json() or {}
    tmdb_id = payload.get('tmdb_id')
    media_type = (payload.get('media_type') or '').lower()
    data = payload.get('data')
    if not tmdb_id or media_type not in {'movie','tv'}:
        return jsonify({'error': 'tmdb_id and valid media_type required'}), 400

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if request.method == 'POST':
                cur.execute(
                    """
                    INSERT INTO likes (user_id, tmdb_id, media_type, data)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id, media_type, tmdb_id)
                    DO UPDATE SET data = EXCLUDED.data, created_at = CURRENT_TIMESTAMP
                    """,
                    (user_id, tmdb_id, media_type, json.dumps(data) if data is not None else None)
                )
            else:
                cur.execute(
                    "DELETE FROM likes WHERE user_id = %s AND tmdb_id = %s AND media_type = %s",
                    (user_id, tmdb_id, media_type)
                )
        conn.commit()
    return jsonify({'success': True})

@app.route('/api/me/trailers', methods=['GET', 'POST'])
@login_required
def api_trailers():
    user_id = _uuid_str(current_user.id)
    if request.method == 'GET':
        return jsonify(_load_user_collection('trailers_watched', user_id))

    payload = request.get_json() or {}
    tmdb_id = payload.get('tmdb_id')
    media_type = (payload.get('media_type') or '').lower()
    data = payload.get('data')
    if not tmdb_id or media_type not in {'movie','tv'}:
        return jsonify({'error': 'tmdb_id and valid media_type required'}), 400

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO trailers_watched (user_id, tmdb_id, media_type, data)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, media_type, tmdb_id)
                DO UPDATE SET data = EXCLUDED.data, created_at = CURRENT_TIMESTAMP
                """,
                (user_id, tmdb_id, media_type, json.dumps(data) if data is not None else None)
            )
        conn.commit()
    return jsonify({'success': True})

# For Vercel deployment
if __name__ == "__main__":
    app.run(debug=True, port=5001)
