import requests
import logging
from fastapi import HTTPException


# Configure logging
logging.basicConfig(level=logging.INFO)

def get_all_stocks(searchword: str) -> dict:
    """ mitä tämä tekee """

 
    data = requests.get(f"https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol={searchword}&interval=5min&apikey=NS7DQ2ENXPZHKR4M").json()


    logging.info(f"Data fetched for {searchword}")


    
    if "Error Message" in data:
        logging.error(f"Error fetching data for {searchword}: {data['Error Message']}")
        raise HTTPException(status_code=404, detail="Stock not found")

    return data