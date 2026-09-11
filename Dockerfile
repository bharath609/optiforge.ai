FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend

ENV PYTHONPATH=/app/backend
ENV PORT=7860
EXPOSE 7860

CMD uvicorn app.main:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT}
