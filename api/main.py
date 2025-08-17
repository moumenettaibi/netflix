from flask import Flask, render_template, redirect

app = Flask(__name__, template_folder='../templates')

# Root route - redirect to browse
@app.route("/")
def index():
    return redirect("/browse")

# Home route serving your index.html
@app.route("/browse")
def home():
    return render_template("index.html")

# My Netflix route
@app.route("/my-netflix")
def my_netflix():
    return render_template("my-netflix.html")

# For Vercel deployment
if __name__ == "__main__":
    app.run(debug=True)
