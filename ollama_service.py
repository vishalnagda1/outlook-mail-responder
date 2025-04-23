import os
import requests
import re


def generate_text(system_prompt, user_prompt):
    try:
        url = f"{os.environ.get('OLLAMA_API_URL')}/api/generate"
        model = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")

        # Format the prompt
        formatted_prompt = f"<s>\n{system_prompt}\n</s>\n\n"
        formatted_prompt += user_prompt
        formatted_prompt += (
            "\n\nIf the mail required my availability then check my calendar availability "
            "and suggest suitable time slots accordingly otherwise ignore it and carefully "
            "draft a concise, professional email response. Do not include anything else apart "
            "from the email response.\n\n"
        )

        payload = {
            "model": model,
            "prompt": formatted_prompt,
            "stream": False,
            "options": {
                "temperature": 0.6,
                "top_p": 0.9,
                "top_k": 40,
                "num_predict": 1024,
            },
        }

        # Make the request with a 15-second timeout
        response = requests.post(url, json=payload, timeout=15)
        response.raise_for_status()

        generated_text = response.json().get("response", "").strip()
        return sanitize_response(generated_text)

    except requests.RequestException as error:
        print(f"Error calling Ollama API: {str(error)}")
        if hasattr(error, "response") and error.response is not None:
            print(f"Response data: {error.response.text}")
            print(f"Response status: {error.response.status_code}")
        raise RuntimeError("Failed to generate text with Ollama")


def sanitize_response(text):
    # Remove signature blocks
    text = re.sub(r"^--+\s*\n.*$", "", text, flags=re.MULTILINE)

    # Remove markdown-style code block formatting
    text = re.sub(r"^```email\s*", "", text)
    text = re.sub(r"```\s*$", "", text)

    # Remove duplicated greeting lines
    lines = text.split("\n")
    seen_greeting = False
    cleaned_lines = []

    for line in lines:
        is_greeting = re.match(
            r"^(dear|hello|hi|greetings|good (morning|afternoon|evening))",
            line,
            re.IGNORECASE,
        )
        if is_greeting:
            if seen_greeting:
                continue
            seen_greeting = True
        cleaned_lines.append(line)

    return "\n".join(cleaned_lines)
