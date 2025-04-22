import requests


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
        "http://localhost:11434/api/generate",
        json={"model": "llama3", "prompt": prompt, "stream": False},
    )
    return response.json()["response"]
