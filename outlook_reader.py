# outlook_reader.py
import requests
from auth_helper import get_access_token


def get_unread_emails():
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = "https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$filter=isRead eq false&$top=5"

    response = requests.get(url, headers=headers)
    response.raise_for_status()
    messages = response.json()["value"]
    return messages
