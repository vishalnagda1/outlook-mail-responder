# Crew AI Microsoft Integration - Email Processing & Calendar Management
# Requirements: pip install crewai langchain python-dotenv requests msal

import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
import msal
import requests
import json
from typing import List, Dict, Any, Optional

from crewai import Agent, Task, Crew, Process
from langchain.tools import BaseTool

# Load environment variables
load_dotenv()


# Microsoft Graph API Authentication
class MicrosoftAuthManager:
    def __init__(self):
        self.client_id = os.getenv("CLIENT_ID")
        self.client_secret = os.getenv("CLIENT_SECRET")
        self.tenant_id = os.getenv("TENANT_ID")
        self.authority = f"https://login.microsoftonline.com/{self.tenant_id}"
        self.scope = ["https://graph.microsoft.com/.default"]
        self.token = None

    def get_token(self):
        if self.token and self.token.get("expires_on", 0) > datetime.now().timestamp():
            return self.token["access_token"]

        app = msal.ConfidentialClientApplication(
            client_id=self.client_id,
            client_credential=self.client_secret,
            authority=self.authority,
        )

        result = app.acquire_token_for_client(scopes=self.scope)

        if "access_token" not in result:
            raise Exception(
                f"Failed to acquire token: {result.get('error_description')}"
            )

        self.token = result
        return result["access_token"]

    def get_headers(self):
        return {
            "Authorization": f"Bearer {self.get_token()}",
            "Content-Type": "application/json",
        }


# Custom Tools for Microsoft Services
class MicrosoftOutlookTool(BaseTool):
    name: str = "microsoft_outlook_reader"
    description: str = "Reads emails from Microsoft Outlook"

    def __init__(self):
        super().__init__()
        self.auth_manager = MicrosoftAuthManager()

    def _run(self, query: str = None, max_emails: int = 10) -> List[Dict[str, Any]]:
        """Fetches recent emails from the user's inbox"""
        headers = self.auth_manager.get_headers()

        # Filter based on query if provided
        filter_param = ""
        if query:
            filter_param = f"&$filter=contains(subject,'{query}')"

        url = f"https://graph.microsoft.com/v1.0/me/messages?$top={max_emails}{filter_param}&$orderby=receivedDateTime desc"

        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch emails: {response.text}")

        emails = response.json().get("value", [])

        # Format emails for better readability
        formatted_emails = []
        for email in emails:
            formatted_emails.append(
                {
                    "id": email.get("id"),
                    "subject": email.get("subject"),
                    "from": email.get("from", {})
                    .get("emailAddress", {})
                    .get("address"),
                    "received_at": email.get("receivedDateTime"),
                    "body_preview": email.get("bodyPreview"),
                    "importance": email.get("importance"),
                    "has_attachments": email.get("hasAttachments"),
                }
            )

        return formatted_emails

    def get_email_content(self, email_id: str) -> Dict[str, Any]:
        """Fetches full content of a specific email"""
        headers = self.auth_manager.get_headers()
        url = f"https://graph.microsoft.com/v1.0/me/messages/{email_id}"

        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch email content: {response.text}")

        email = response.json()
        return {
            "id": email.get("id"),
            "subject": email.get("subject"),
            "from": email.get("from", {}).get("emailAddress", {}).get("address"),
            "from_name": email.get("from", {}).get("emailAddress", {}).get("name"),
            "to": [
                recipient.get("emailAddress", {}).get("address")
                for recipient in email.get("toRecipients", [])
            ],
            "cc": [
                recipient.get("emailAddress", {}).get("address")
                for recipient in email.get("ccRecipients", [])
            ],
            "received_at": email.get("receivedDateTime"),
            "body": email.get("body", {}).get("content"),
            "importance": email.get("importance"),
        }


class MicrosoftCalendarTool(BaseTool):
    name: str = "microsoft_calendar_checker"
    description: str = "Checks calendar availability in Microsoft Calendar"

    def __init__(self):
        super().__init__()
        self.auth_manager = MicrosoftAuthManager()

    def _run(self, days_ahead: int = 7) -> List[Dict[str, Any]]:
        """Fetches calendar events for the next specified days"""
        headers = self.auth_manager.get_headers()

        # Set time range
        start_time = datetime.now().isoformat() + "Z"
        end_time = (datetime.now() + timedelta(days=days_ahead)).isoformat() + "Z"

        url = f"https://graph.microsoft.com/v1.0/me/calendarView?startDateTime={start_time}&endDateTime={end_time}"

        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch calendar events: {response.text}")

        events = response.json().get("value", [])

        # Format events
        formatted_events = []
        for event in events:
            formatted_events.append(
                {
                    "id": event.get("id"),
                    "subject": event.get("subject"),
                    "start": event.get("start", {}).get("dateTime"),
                    "end": event.get("end", {}).get("dateTime"),
                    "location": event.get("location", {}).get("displayName"),
                    "is_all_day": event.get("isAllDay"),
                }
            )

        return formatted_events

    def find_available_slots(
        self,
        min_duration_minutes: int = 30,
        days_ahead: int = 7,
        working_hours: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Finds available time slots in the calendar"""
        if not working_hours:
            # Default working hours (9 AM to 5 PM)
            working_hours = {"start_hour": 9, "end_hour": 17}

        # Get all events
        events = self._run(days_ahead)

        # Find available slots
        available_slots = []
        current_date = datetime.now()
        end_date = current_date + timedelta(days=days_ahead)

        while current_date < end_date:
            # Skip weekends (Saturday=5, Sunday=6)
            if current_date.weekday() >= 5:
                current_date += timedelta(days=1)
                continue

            # Set working hours for this day
            day_start = datetime(
                current_date.year,
                current_date.month,
                current_date.day,
                working_hours["start_hour"],
            )

            day_end = datetime(
                current_date.year,
                current_date.month,
                current_date.day,
                working_hours["end_hour"],
            )

            # If we're already past working hours for today, move to next day
            if datetime.now() > day_end:
                current_date += timedelta(days=1)
                continue

            # If we're in the middle of the working day, start from now
            if datetime.now() > day_start and datetime.now() < day_end:
                day_start = datetime.now()

            # Get events for this day
            day_events = [
                event
                for event in events
                if datetime.fromisoformat(event["start"].replace("Z", "+00:00")).date()
                == current_date.date()
            ]

            # Sort events by start time
            day_events.sort(key=lambda x: x["start"])

            # Initialize the start time for checking
            check_time = day_start

            # Check time slots between events
            for event in day_events:
                event_start = datetime.fromisoformat(
                    event["start"].replace("Z", "+00:00")
                )
                event_end = datetime.fromisoformat(event["end"].replace("Z", "+00:00"))

                # If there's enough time before the event
                duration = (event_start - check_time).total_seconds() / 60
                if duration >= min_duration_minutes:
                    available_slots.append(
                        {
                            "start": check_time.isoformat(),
                            "end": event_start.isoformat(),
                            "duration_minutes": duration,
                        }
                    )

                # Move check time to after this event
                check_time = max(check_time, event_end)

            # Check if there's time after the last event
            duration = (day_end - check_time).total_seconds() / 60
            if duration >= min_duration_minutes:
                available_slots.append(
                    {
                        "start": check_time.isoformat(),
                        "end": day_end.isoformat(),
                        "duration_minutes": duration,
                    }
                )

            # Move to next day
            current_date += timedelta(days=1)

        return available_slots


class MicrosoftEmailDraftTool(BaseTool):
    name: str = "microsoft_email_draft_creator"
    description: str = "Creates email draft responses in Microsoft Outlook"

    def __init__(self):
        super().__init__()
        self.auth_manager = MicrosoftAuthManager()

    def _run(
        self, email_content: Dict[str, Any], reply_to_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Creates a draft email in Outlook"""
        headers = self.auth_manager.get_headers()

        # Prepare the email data
        email_data = {
            "subject": email_content.get("subject", ""),
            "body": {"contentType": "HTML", "content": email_content.get("body", "")},
            "toRecipients": [
                {"emailAddress": {"address": recipient}}
                for recipient in email_content.get("to", [])
            ],
            "ccRecipients": [
                {"emailAddress": {"address": recipient}}
                for recipient in email_content.get("cc", [])
            ],
        }

        # Create a new draft
        url = "https://graph.microsoft.com/v1.0/me/messages"

        # If replying to an existing email, use the createReply endpoint
        if reply_to_id:
            url = f"https://graph.microsoft.com/v1.0/me/messages/{reply_to_id}/createReply"
            response = requests.post(url, headers=headers)
            if response.status_code != 201:
                raise Exception(f"Failed to create reply: {response.text}")

            # Get the ID of the newly created draft reply
            draft_id = response.json().get("id")

            # Update the draft reply with our content
            url = f"https://graph.microsoft.com/v1.0/me/messages/{draft_id}"
            response = requests.patch(
                url, headers=headers, json={"body": email_data["body"]}
            )
        else:
            # Create a new draft from scratch
            response = requests.post(url, headers=headers, json=email_data)

        if response.status_code not in [200, 201]:
            raise Exception(f"Failed to create email draft: {response.text}")

        return response.json()


# Define the Agents
email_reader_agent = Agent(
    role="Email Reader",
    goal="Scan inbox and identify emails requiring responses or scheduling",
    backstory="I'm specialized in processing emails and extracting key information from Microsoft Outlook.",
    verbose=True,
    allow_delegation=True,
    tools=[MicrosoftOutlookTool()],
)

calendar_agent = Agent(
    role="Calendar Manager",
    goal="Find available time slots for meetings and appointments",
    backstory="I specialize in analyzing Microsoft Calendar data to find optimal meeting times.",
    verbose=True,
    allow_delegation=True,
    tools=[MicrosoftCalendarTool()],
)

draft_agent = Agent(
    role="Email Draft Generator",
    goal="Create contextually appropriate email draft responses",
    backstory="I craft professional email responses based on context, requirements, and calendar availability.",
    verbose=True,
    allow_delegation=True,
    tools=[MicrosoftEmailDraftTool()],
)

# Define Tasks
email_scanning_task = Task(
    description="""
    1. Scan the most recent 15 emails in the inbox
    2. Identify emails that require scheduling meetings or calls
    3. Select the most urgent email that needs a response
    4. Extract all relevant details from the email including:
       - Sender information
       - Subject
       - Key points
       - Any timing constraints or preferences mentioned
    5. Return the email ID and a detailed summary of the email content
    """,
    agent=email_reader_agent,
)

calendar_checking_task = Task(
    description="""
    Using the email details provided by the Email Reader:
    1. Check calendar availability for the next 5 business days
    2. Find at least 3 available time slots of 30-60 minutes
    3. Prioritize time slots that align with any preferences mentioned in the email
    4. For each available slot, specify:
       - Day of week and date
       - Start and end time
       - Duration
    5. Return a formatted list of the available time slots
    """,
    agent=calendar_agent,
    context=[email_scanning_task],
)

draft_creation_task = Task(
    description="""
    Using the email details from the Email Reader and available time slots from the Calendar Manager:
    1. Draft a professional response to the selected email
    2. Include a brief personalized greeting
    3. Acknowledge the main points from the original email
    4. Clearly present the available meeting time options
    5. Include a polite closing
    6. Format the email in a professional manner
    7. Create the email draft in the system using the MicrosoftEmailDraftTool
    8. Return a confirmation of the draft creation along with the draft ID
    """,
    agent=draft_agent,
    context=[email_scanning_task, calendar_checking_task],
)

# Create the Crew
email_workflow_crew = Crew(
    agents=[email_reader_agent, calendar_agent, draft_agent],
    tasks=[email_scanning_task, calendar_checking_task, draft_creation_task],
    verbose=2,
    process=Process.sequential,
)


# Main execution function
def main():
    print("Starting Crew AI Microsoft Email & Calendar Workflow...")
    result = email_workflow_crew.kickoff()
    print("\nWorkflow Completed!")
    print(f"Result: {result}")
    return result


if __name__ == "__main__":
    # Environment Setup Instructions
    print("""
    Before running this script, make sure to:
    1. Create a .env file with the following credentials:
       MS_CLIENT_ID=your_microsoft_app_client_id
       MS_CLIENT_SECRET=your_microsoft_app_client_secret
       MS_TENANT_ID=your_microsoft_tenant_id
       
    2. Register an application in the Azure Portal with the following permissions:
       - Mail.Read
       - Mail.ReadWrite
       - Mail.Send
       - Calendars.Read
       - Calendars.ReadWrite
    """)

    # Run the workflow
    main()
