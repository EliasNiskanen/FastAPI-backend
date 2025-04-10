# FastAPI-backend
FastAPI backend for fullstack database management webapp

I am making a full stack stock/cryptomarket visualization webapp which pulls stock information from different APIs for my own use only. 
Ongoing:
    -Pulling data from public APIs to my own PostgreSQL database for further examination, because free API keys are limited by daily requests. I need to store the data in my own PostgreSQL database to limit the requests from the public API. 
    -Making a good base for frontend to visualize the stock and crypto markets. 
    -Creating logic to specifically go through data and visualize it uniquelly.
    -Hosting in some cloud service (GCP, Azure or AWS).
    -Unittests.
    -Error handling.

To run:

poetry install
poetry run uvicorn main:app --reload
