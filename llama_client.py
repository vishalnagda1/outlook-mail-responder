# llama_client.py
import requests


def generate_draft(email_subject, email_body, calendar_data=None):
    prompt = f"""You are a helpful assistant. Write a polite and professional response to the following email.
    
Subject: {email_subject}

Body:
{email_body}

"""
    if calendar_data:
        prompt += f"\nAlso consider the following upcoming events when drafting the reply:\n{calendar_data}\n"

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": "llama3", "prompt": prompt, "stream": False},
    )
    return response.json()["response"]
