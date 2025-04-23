import builtins
import os
from datetime import datetime, timedelta
import re
import dotenv
import msal
import pytz
import requests

TIMEZONE = pytz.timezone("Asia/Kolkata")

dotenv.load_dotenv()
######################################################################
# Save the original print function
original_print = builtins.print

# ANSI color codes
COLOR_CODES = {
    0: "\033[0m",  # default
    1: "\033[91m",  # red
    2: "\033[92m",  # green
    3: "\033[93m",  # yellow
    4: "\033[94m",  # blue
    5: "\033[95m",  # magenta
    6: "\033[96m",  # cyan
    7: "\033[90m",  # gray
    8: "\033[97m",  # white
    9: "\033[35m",  # purple
}


def colorful_print(*args, sep=" ", end="\n", file=None, flush=False, c=0):
    # Get color or fallback to default
    color = COLOR_CODES.get(c, COLOR_CODES[0])
    reset = COLOR_CODES[0]

    # Prepare output
    text = sep.join(str(arg) for arg in args)
    original_print(f"{color}{text}{reset}", end=end, file=file, flush=flush)


# Now safely override print
builtins.print = colorful_print


##########################################################################

# Configuration - fill these with your Microsoft app registration details
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
TENANT_ID = os.getenv("TENANT_ID")

USER_EMAIL = "team@tech-now.io"  # The email account to access

ACCESS_TOKEN = None  # Global variable to store the access token


def get_access_token():
    """Get Microsoft Graph API access token using client credentials"""

    global ACCESS_TOKEN

    if ACCESS_TOKEN is not None:
        return ACCESS_TOKEN

    # Authority URL

    authority = f"https://login.microsoftonline.com/{TENANT_ID}"

    # Create MSAL app

    app = msal.ConfidentialClientApplication(
        client_id=CLIENT_ID, client_credential=CLIENT_SECRET, authority=authority
    )

    # Acquire token for application

    scopes = ["https://graph.microsoft.com/.default"]

    result = app.acquire_token_for_client(scopes=scopes)

    if "access_token" not in result:
        raise Exception(f"Authentication failed: {result.get('error_description')}")

    ACCESS_TOKEN = result["access_token"]
    return ACCESS_TOKEN


def read_emails(max_count=10):
    """Read emails from the specified user's inbox"""

    global USER_EMAIL

    token = get_access_token()

    headers = {"Authorization": f"Bearer {token}"}

    # Get messages from user's inbox
    response = requests.get(
        f"https://graph.microsoft.com/v1.0/users/{USER_EMAIL}/messages?$filter=isRead eq false&$top={max_count}&$orderby=receivedDateTime desc",
        headers=headers,
    )

    if response.status_code != 200:
        raise Exception(f"Failed to fetch emails: {response.text}")

    emails = response.json().get("value", [])

    # Format emails

    formatted_emails = []

    for email in emails:
        formatted_emails.append(
            {
                "id": email.get("id"),
                "subject": email.get("subject"),
                "from": email.get("from", {}).get("emailAddress", {}).get("address"),
                "received_at": email.get("receivedDateTime"),
                "body_preview": email.get("bodyPreview"),
            }
        )

    return formatted_emails


def check_calendar(days_ahead=7):
    """Check calendar for the specified user"""

    token = get_access_token()

    now = datetime.now()
    end = now + timedelta(days=days_ahead)

    # Headers
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Parameters
    params = {
        "startDateTime": now.isoformat(),
        "endDateTime": end.isoformat(),
        "$select": "subject,start,end",
        "$orderby": "start/dateTime",
        "$top": days_ahead,
    }

    # Request
    response = requests.get(
        f"https://graph.microsoft.com/v1.0/users/{USER_EMAIL}/calendarView",
        headers=headers,
        params=params,
    )

    # Response handling
    if response.status_code != 200:
        raise Exception(f"Failed to fetch calendar: {response.text}")

    utc = pytz.utc

    events = response.json().get("value", [])
    formatted_events = []
    for e in events:
        # Parse and localize the UTC times
        start_utc = utc.localize(datetime.fromisoformat(e["start"]["dateTime"]))
        end_utc = utc.localize(datetime.fromisoformat(e["end"]["dateTime"]))

        # Convert to user's timezone
        start_local = start_utc.astimezone(TIMEZONE)
        end_local = end_utc.astimezone(TIMEZONE)

        # Format output
        start_str = start_local.strftime("%Y-%m-%d %I:%M %p")
        end_str = end_local.strftime("%Y-%m-%d %I:%M %p")

        formatted_events.append(
            {
                "subject": e["subject"],
                "start": start_str,
                "end": end_str,
            }
        )

    return formatted_events


def find_available_slots(days_ahead=7, duration_minutes=30):
    """Find available time slots in calendar"""

    events = check_calendar(days_ahead)

    # Set working hours (9 AM to 5 PM)

    working_start_hour = 9

    working_end_hour = 17

    available_slots = []

    current_date = datetime.datetime.now()

    end_date = current_date + datetime.timedelta(days=days_ahead)

    while current_date < end_date:
        # Skip weekends

        if current_date.weekday() >= 5:
            current_date += datetime.timedelta(days=1)

            continue

        # Set working hours for this day

        day_start = datetime.datetime(
            current_date.year, current_date.month, current_date.day, working_start_hour
        )

        day_end = datetime.datetime(
            current_date.year, current_date.month, current_date.day, working_end_hour
        )

        # Get events for this day

        day_events = []

        for event in events:
            event_start = datetime.datetime.fromisoformat(
                event["start"].replace("Z", "+00:00")
            )

            if event_start.date() == current_date.date():
                day_events.append(
                    {
                        "start": event_start,
                        "end": datetime.datetime.fromisoformat(
                            event["end"].replace("Z", "+00:00")
                        ),
                    }
                )

        # Sort events by start time

        day_events.sort(key=lambda x: x["start"])

        # Find gaps between events

        check_time = day_start

        for event in day_events:
            # If there's enough time before this event

            if (event["start"] - check_time).total_seconds() / 60 >= duration_minutes:
                available_slots.append(
                    {
                        "date": check_time.strftime("%Y-%m-%d"),
                        "day": check_time.strftime("%A"),
                        "start_time": check_time.strftime("%I:%M %p"),
                        "end_time": event["start"].strftime("%I:%M %p"),
                    }
                )

            # Move check time to after this event

            check_time = max(check_time, event["end"])

        # Check if there's time after the last event

        if (day_end - check_time).total_seconds() / 60 >= duration_minutes:
            available_slots.append(
                {
                    "date": check_time.strftime("%Y-%m-%d"),
                    "day": check_time.strftime("%A"),
                    "start_time": check_time.strftime("%I:%M %p"),
                    "end_time": day_end.strftime("%I:%M %p"),
                }
            )

        # Move to next day

        current_date += datetime.timedelta(days=1)

    return available_slots


def create_email_draft(payload: dict):
    """Create an email draft for the user"""

    token = get_access_token()

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    response = requests.post(
        f"https://graph.microsoft.com/v1.0/users/{USER_EMAIL}/messages",
        headers=headers,
        json=payload,
    )

    if response.status_code not in [200, 201]:
        raise Exception(f"Failed to create email draft: {response.text}")

    return response.json()


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
            "from the email body, no subject required just email body with proper greetings and signature. Don't forget to add name as 'TechNow' in the signature.\n\n"
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
        print(f"Error calling Ollama API: {str(error)}", c=1)
        if hasattr(error, "response") and error.response is not None:
            print(f"Response data: {error.response.text}", c=3)
            print(f"Response status: {error.response.status_code}", c=4)
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


def mark_user_email_as_read(email_id: str) -> bool:
    token = get_access_token()

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    response = requests.patch(
        f"https://graph.microsoft.com/v1.0/users/{USER_EMAIL}/messages/{email_id}",
        headers=headers,
        json={"isRead": True},
    )

    if response.status_code not in [200, 201]:
        raise Exception(f"Failed to mark as read: {response.text}", c=4)

    return response.json()


def generate_user_draft_response(
    email_id: str,
    calendar_events: list,
):
    token = get_access_token()

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    params = {
        "$select": "id,subject,body,receivedDateTime,from,toRecipients",
    }

    response = requests.get(
        f"https://graph.microsoft.com/v1.0/users/{USER_EMAIL}/messages/{email_id}",
        headers=headers,
        params=params,
    )

    if response.status_code != 200:
        raise Exception(f"Failed to fetch email: {response.text}")

    email = response.json()

    sender_name = email["from"]["emailAddress"]["name"]
    body_content = re.sub(r"<[^>]+>", " ", email["body"]["content"])

    if calendar_events:
        availability = "##### My upcoming meetings:" + "".join(
            [
                f"\n- {e['subject']} on {e['start']} from {e['start']} to {e['end']}"
                for e in calendar_events
            ]
        )
    else:
        availability = "I have no scheduled meetings in the next few days."

    system_prompt = (
        "You are an email assistant that drafts professional responses. "
        "Consider the calendar availability when mentioned. Be concise but polite."
    )
    user_prompt = (
        f"Original email from {sender_name}:\nSubject: {email['subject']}\n\n{body_content}\n\n"
        f"{availability}\n\nDraft a professional response to this email."
    )

    draft = generate_text(system_prompt, user_prompt)

    payload = {
        "subject": f"RE: {email['subject']}",
        "importance": email.get("importance", "normal"),
        "body": {"contentType": "HTML", "content": draft.replace("\n", "<br>")},
        "toRecipients": [email["from"]],
        "isDraft": True,
    }

    return payload


def main():
    try:
        # 1. Read recent emails
        print("Reading recent emails...")
        emails = read_emails(10)
        print(f"Found {len(emails)} recent emails")

        # For demo, use the first email
        if not emails:
            return None

        events = check_calendar(15)

        for email in emails:
            print(
                f"  - {email['subject']} (from: {email['from']}, received at: {email['received_at']}",
                c=3,
            )

            # 2. Process specific email - check calendar and create draft

            # result = process_specific_email(email)
            payload = generate_user_draft_response(email["id"], events)

            result = create_email_draft(payload)

            # 3. Mark email as read
            result = mark_user_email_as_read(email["id"])
            print(
                f"Email with subject '{result['subject']}' has been marked as read", c=2
            )
    except Exception as e:
        print(f"An error occurred: {str(e)}", c=1)
        if hasattr(e, "response") and e.response is not None:
            print(f"Response data: {e.response.text}", c=3)
            print(f"Response status: {e.response.status_code}", c=4)


if __name__ == "__main__":
    main()
