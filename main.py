from fastapi import FastAPI, status
import stocks



app = FastAPI()

@app.get("/{searchword}", response_model=dict , status_code=status.HTTP_200_OK)
def get_stocks_from_Alphavantage(searchword: str):
    return stocks.get_all_stocks(searchword)


