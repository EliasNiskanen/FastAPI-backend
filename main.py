from fastapi import FastAPI, status
import stocks

app = FastAPI()

@app.get("/{searchword}", status_code=status.HTTP_200_OK)
def read_root(searchword: str):
    return stocks.get_all_stocks(searchword)


