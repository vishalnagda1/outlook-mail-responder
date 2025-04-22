import os
import requests

OLLAMA_URL = os.getenv("OLLAMA_URL")


def generate_draft(subject, body, calendar_text=""):
    prompt = f"""
You received an email with the following subject and body:

Subject: {subject}
Body: {body}

Use the following upcoming calendar info if needed:
{calendar_text}

Draft a professional reply.
"""
    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": "llama3.1:8b", "prompt": prompt, "stream": False},
    )
    return response.json()["response"]
