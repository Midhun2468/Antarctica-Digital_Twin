# Antarctica Digital Twin

A digital platform for monitoring and managing India's Antarctic research stations, Maitri and Bharati.

This project was developed for **Smart India Hackathon 2026 – Problem Statement SIH26060**. It brings important station information into one dashboard to make remote monitoring easier.

## Features

- **Weather Monitoring:** View temperature, wind speed and other weather conditions.
- **Energy Management:** Monitor energy usage and test different environmental scenarios.
- **Logistics Management:** View station supply and logistics information.
- **Infrastructure Management:** Add and manage infrastructure components.
- **Antarctica 3D View:** Explore a 3D view of Antarctica.
- **Environmental Monitoring:** Switch between temperature, wind, snowfall, visibility, storm and pressure layers.
- **Simulation:** Test different conditions, such as extreme cold, high winds and severe storms.
- **AI Chatbot:** Ask Penguin questions about the dashboard and use simple commands to access its features.

## Technologies Used

- HTML, CSS and JavaScript
- Three.js
- Leaflet
- Python and FastAPI
- Open-Meteo API
- Windy
- Google Gemini API

## Running the Project

### Requirements

- Python
- pip
- A modern web browser

### 1. Clone the repository

```bash
git clone git@github.com:Midhun2468/Antarctica-Digital_Twin.git
cd Antarctica-Digital_Twin
```

### 2. Install the backend dependencies

Open a terminal in the backend folder and install the required Python packages.

```bash
pip install fastapi uvicorn requests pydantic
```

If the project includes a `requirements.txt` file, use this instead:

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Add the required API keys to your environment or `.env` file, depending on the backend configuration.

- `GOOGLE_API_KEY` – for the Penguin chatbot.
- `WINDY_API_KEY` – for Windy integration, if required.

Do not upload API keys or other secrets to GitHub.

### 4. Start the backend

Run the following command from the directory containing the FastAPI application:

```bash
uvicorn main:app --reload
```

Replace `main:app` with the correct Python filename and application name if they differ.

Open the local address shown in the terminal to access the application.

## Note

This project is a prototype for remote management of Antarctic research stations. Some dashboard values and simulation results may be simulated or obtained from external weather services, depending on the feature.

## Project

**Problem Statement:** SIH26060 – Digital Platform for Efficient Remote Management of Indian Antarctic Research Stations

**Repository:** [Antarctica Digital Twin](https://github.com/Midhun2468/Antarctica-Digital_Twin)
