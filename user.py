import builtins
import os
from datetime import datetime, timedelta

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

ACCESS_TOKEN = None


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
    print("Access token: ", ACCESS_TOKEN, c=1)
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

    print("Response: ", response.json(), c=1)

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

    print("Formatted Emails: ", formatted_emails, c=3)

    return formatted_emails


def check_calendar(days_ahead=7):
    """Check calendar for the specified user"""

    token = get_access_token()

    now = datetime.now()
    end = now + timedelta(days=7)

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
        start_str = start_local.strftime("%Y-%m-%d %H:%M")
        end_str = end_local.strftime("%Y-%m-%d %H:%M")

        print(f"{e['subject']} | {start_str} - {end_str}")
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


def create_email_draft(to_recipients, subject, body_content):
    """Create an email draft for the user"""

    token = get_access_token()

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Format recipients

    recipients = []

    for recipient in to_recipients:
        recipients.append({"emailAddress": {"address": recipient}})

    # Create draft email

    email_data = {
        "subject": subject,
        "body": {"contentType": "HTML", "content": body_content},
        "toRecipients": recipients,
        "isDraft": True,
    }

    response = requests.post(
        f"https://graph.microsoft.com/v1.0/users/{USER_EMAIL}/messages",
        headers=headers,
        json=email_data,
    )

    if response.status_code not in [200, 201]:
        raise Exception(f"Failed to create email draft: {response.text}")

    return response.json()


def process_specific_email(email_id):
    """Process a specific email, find availability, and create a response draft"""

    token = get_access_token()

    headers = {"Authorization": f"Bearer {token}"}

    # Get the specific email

    response = requests.get(
        f"https://graph.microsoft.com/v1.0/users/{USER_EMAIL}/messages/{email_id}",
        headers=headers,
    )

    if response.status_code != 200:
        raise Exception(f"Failed to fetch email: {response.text}")

    email = response.json()

    focus_email = {
        "id": email.get("id"),
        "subject": email.get("subject"),
        "from": email.get("from", {}).get("emailAddress", {}).get("address"),
        "from_name": email.get("from", {}).get("emailAddress", {}).get("name"),
        "body": email.get("body", {}).get("content"),
    }

    # Find available slots

    available_slots = find_available_slots(days_ahead=5)

    # Format available times for email

    available_times_html = "<ul>"

    for slot in available_slots[:3]:  # Show top 3 slots
        available_times_html += f"<li><strong>{slot['day']} ({slot['date']})</strong>: {slot['start_time']} - {slot['end_time']}</li>"

    available_times_html += "</ul>"

    # Create email body

    body = f"""
<p>Hello {focus_email["from_name"]},</p>
<p>Thank you for your email regarding "{focus_email["subject"]}".</p>
<p>I've checked my calendar and have the following availability for our meeting:</p>

    {available_times_html}
<p>Please let me know which time works best for you, and I'll send a calendar invitation.</p>
<p>Best regards,<br>{USER_EMAIL.split("@")[0]}</p>

    """

    # Create the draft

    draft = create_email_draft(
        [focus_email["from"]],  # Reply to sender
        f"RE: {focus_email['subject']}",
        body,
    )

    return {
        "email": focus_email,
        "available_slots": available_slots[:3],
        "draft_id": draft.get("id"),
    }


def main():
    # 1. Read recent emails
    print("Reading recent emails...")
    emails = read_emails(1)
    print(f"Found {len(emails)} recent emails")

    # For demo, use the first email
    if not emails:
        return None

    events = check_calendar(15)

    for email in emails:
        print(
            f"  - {email['subject']} (from: {email['from']}, received at: {email['received_at']})"
        )

        # print(f"\nProcessing email: {email['subject']}")

        # # 2. Process specific email - check calendar and create draft

        # result = process_specific_email(email)

        # print("\nAvailable time slots:")

        # for i, slot in enumerate(result["available_slots"], 1):
        #     print(
        #         f"  {i}. {slot['day']} ({slot['date']}): {slot['start_time']} - {slot['end_time']}"
        #     )

        # print(f"\nEmail draft created with ID: {result['draft_id']}")


if __name__ == "__main__":
    main()
