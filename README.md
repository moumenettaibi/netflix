# Netflix Clone

This project is a simplified clone of the Netflix user interface, built to demonstrate front-end and back-end development skills. It aims to replicate key aspects of the Netflix browsing experience, including a home page, movie/show listings, and potentially user authentication (though this would need to be confirmed by the user).

## Features

*   **Responsive Design:** Adapts to various screen sizes for a seamless viewing experience on desktop and mobile devices.
*   **Dynamic Content Display:** Fetches and displays movie/show data (placeholder data for now).
*   **User Interface:** Mimics the look and feel of the Netflix platform.
*   **Basic Navigation:** Allows users to browse different sections.

## Technologies Used

*   **Frontend:**
    *   HTML5
    *   CSS3 (with `static/css/styles.css` and `static/css/my-netflix.css`)
    *   JavaScript (with `static/js/script.js` and `static/js/my-netflix.js`)
*   **Backend:**
    *   Python (likely Flask or FastAPI, given `api/main.py` and `requirements.txt`)
*   **Deployment:**
    *   Vercel (indicated by `vercel.json`)

## Installation and Setup

To run this project locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/netflix-clone.git
    cd netflix-clone
    ```

2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: `venv\Scripts\activate`
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Run the backend API:**
    ```bash
    python api/main.py
    ```

5.  **Open in browser:**
    Once the backend is running, open your web browser and navigate to `http://127.0.0.1:5000` (or whatever port the backend is running on).

## Usage

*   Navigate through the home page to see featured content.
*   Click on movie/show titles to view details (if implemented).

## Contributing

Contributions are welcome! Please fork the repository and create a pull request with your changes.

## License

This project is open source and available under the [MIT License](LICENSE).