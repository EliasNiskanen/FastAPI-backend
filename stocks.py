import requests
import logging
from typing import List
from fastapi import HTTPException

from models import AlphaVantageStock


# Configure logging
logging.basicConfig(level=logging.INFO)

def get_all_stocks(searchword: str) -> dict:
    """Fetch stock data from Alpha Vantage API.
    Args:
        searchword (str): The stock symbol to search for."""

 
    data = requests.get(f"https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol={searchword}&interval=5min&apikey=NS7DQ2ENXPZHKR4M").json()


    logging.info(f"Data fetched for {searchword}")


    
    if "Error Message" in data:
        logging.error(f"Error fetching data for {searchword}: {data['Error Message']}")
        raise HTTPException(status_code=500, detail="Error fetching data")

    return data