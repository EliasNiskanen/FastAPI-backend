from pydantic import BaseModel


class AlphaVantageStock(BaseModel):
    """Stock model"""
    symbol: str
    name: str
    price: float
    change: float
    change_percent: float