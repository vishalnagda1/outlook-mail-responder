import requests

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


def get_unread_emails(token):
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{GRAPH_BASE}/me/mailFolders/Inbox/messages?$filter=isRead eq false&$top=5"
    res = requests.get(url, headers=headers)
    res.raise_for_status()
    return res.json()["value"]


def get_calendar_events(token):
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{GRAPH_BASE}/me/calendar/events?$top=3"
    res = requests.get(url, headers=headers)
    res.raise_for_status()
    return res.json()["value"]


def create_draft(token, original_id, draft_body):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    create_url = f"{GRAPH_BASE}/me/messages/{original_id}/createReply"
    draft = requests.post(create_url, headers=headers).json()

    update_url = f"{GRAPH_BASE}/me/messages/{draft['id']}"
    requests.patch(
        update_url,
        headers=headers,
        json={"body": {"contentType": "Text", "content": draft_body}},
    )

    return draft["id"]
