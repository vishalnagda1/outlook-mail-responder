import json
import logging
import os
import re
import traceback
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import pytz
import requests
from msal import ConfidentialClientApplication
from requests.exceptions import HTTPError

from ollama_service import generate_text

logging.basicConfig(level=logging.INFO)
app = logging.getLogger(__name__)


class MSGraphAPI:
    def __init__(
        self,
        tenant_id: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        token: Optional[
            str
        ] = None,  # Passing user token will not work for most of the functions
    ):
        self.tenant_id: str = tenant_id or os.getenv("TENANT_ID")
        self.client_id: str = client_id or os.getenv("CLIENT_ID")
        self.client_secret: str = client_secret or os.getenv("CLIENT_SECRET")
        self.user_provided_token: bool = token is not None
        self.credentials: ConfidentialClientApplication = ConfidentialClientApplication(
            tenant_id=self.tenant_id,
            client_id=self.client_id,
            client_secret=self.client_secret,
        )
        self.token: str = token or self._get_token()

    def _get_token(self) -> str:
        return self.credentials.get_token("https://graph.microsoft.com/.default").token

    def _refresh_token_if_expired(self):
        if not self.user_provided_token:
            self.token = self._get_token()

    def request(
        self,
        endpoint: str,
        method: Optional[str] = "GET",
        headers: Optional[dict] = {},
        retries: int = 1,  # Added retries parameter to limit retry attempts
        **kwargs: Any,
    ) -> Optional[requests.Response]:
        try:
            url = f"https://graph.microsoft.com/v1.0/{endpoint}"
            headers.update({"Authorization": f"Bearer {self.token}"})
            response = requests.request(method, url, headers=headers, **kwargs)
            response.raise_for_status()
            return response
        except HTTPError as http_err:
            if (
                http_err.response.status_code == 401 and retries > 0
            ):  # Unauthorized error
                if self.user_provided_token:
                    logging.error("User-provided token expired, not retrying.")
                    return None
                logging.info("Token expired, refreshing token...")
                self._refresh_token_if_expired()
                # Retry the request with the new token
                return self.request(
                    endpoint, method, headers, retries=retries - 1, **kwargs
                )
            else:
                logging.error(traceback.format_exc())
                return None
        except Exception as _:
            logging.error(traceback.format_exc())
            return None

    def get_token(self) -> Optional[str]:
        try:
            return self.token
        except Exception as _:
            logging.error(traceback.format_exc())
            return None

    # App specific methods
    def renew_token(self) -> Optional[str]:
        try:
            self.token = self._get_token()
            return self.token
        except Exception as _:
            logging.error(traceback.format_exc())
            return None

    def all_users_in_organization(self) -> Optional[Dict[str, Any]]:
        response = self.request("users")
        if response:
            return response.json()
        return None

    def all_groups_in_organization(self) -> Optional[Dict[str, Any]]:
        response = self.request("groups")
        if response:
            return response.json()
        return None

    def group_detail(self, group_id: str) -> Optional[Dict[str, Any]]:
        response = self.request(f"groups/{group_id}")
        if response:
            return response.json()
        return None

    def group_members(self, group_id: str) -> Optional[Dict[str, Any]]:
        response = self.request(f"groups/{group_id}/members?$count=true")
        if response:
            return response.json()
        return None

    def group_drive(self, group_id: str) -> Optional[Dict[str, Any]]:
        response = self.request(f"groups/{group_id}/drive/items/root/children")
        if response:
            return response.json()
        return None

    def user_detail(self, id_or_mail: str) -> Optional[Dict[str, Any]]:
        response = self.request(f"users/{id_or_mail}")
        if response:
            return response.json()
        return None

    def user_photo(self, id: str) -> Optional[Dict[set, Any]]:
        response = self.request(f"users/{id}/photo/$value")
        if response:
            return response.content
        return None

    def user_identities(self, id: str) -> Optional[Dict[set, Any]]:
        response = self.request(f"users/{id}/identities")
        if response:
            return response.json()
        return None

    # User specific methods
    def my_photo(self) -> Optional[Dict[set, Any]]:
        response = self.request("me/photo/$value")
        if response:
            return response.content
        return None

    def my_identities(self) -> Optional[Dict[set, Any]]:
        response = self.request("me/identities")
        if response:
            return response.json()
        return None

    def my_details(self) -> Optional[Dict[str, Any]]:
        payload = json.dumps(
            {
                "requests": [
                    {"url": "/me", "method": "GET", "id": "1"},
                    {"url": "/me/identities", "method": "GET", "id": "2"},
                ]
            }
        )
        headers = {"Content-Type": "application/json"}
        response = self.request(
            endpoint="$batch", method="POST", headers=headers, data=payload
        )
        if response:
            responses = response.json().get("responses")
            if responses:
                data = {}
                for resp in responses:
                    if resp.get("id") == "1":
                        if resp.get("status") == 200:
                            data.update(resp.get("body"))
                    elif resp.get("id") == "2":
                        if resp.get("status") == 200:
                            identities = resp.get("body").get("value")
                            if isinstance(identities, list):
                                data["identities"] = identities
                return data
        return None

    def get_unread_emails(self) -> Optional[list]:
        response = self.request(
            "me/mailFolders/inbox/messages",
            params={
                "$filter": "isRead eq false",
                "$top": 50,
                "$select": "id,subject,bodyPreview,receivedDateTime,from,importance,hasAttachments",
                "$orderby": "receivedDateTime DESC",
            },
        )
        if response:
            return response.json().get("value", [])
        return None

    def get_email_details(
        self, email_id: str, user_timezone: str = "Asia/Calcutta"
    ) -> Optional[Dict[str, Any]]:
        email_response = self.request(
            f"me/messages/{email_id}",
            params={
                "$select": "id,subject,body,receivedDateTime,from,toRecipients,ccRecipients,importance,hasAttachments"
            },
        )
        if not email_response:
            return None

        email = email_response.json()

        tz = pytz.timezone(user_timezone)
        now = datetime.now(tz)
        end_of_week = now + timedelta(days=7)

        calendar_response = self.request(
            "me/calendarView",
            params={
                "startDateTime": now.isoformat(),
                "endDateTime": end_of_week.isoformat(),
                "$select": "subject,start,end,location",
                "$orderby": "start/dateTime",
                "$top": 10,
            },
        )
        if not calendar_response:
            return {"email": email, "events": []}

        events = []
        for e in calendar_response.json().get("value", []):
            start_dt = tz.localize(
                datetime.fromisoformat(e["start"]["dateTime"].replace("Z", "+00:00"))
            )
            end_dt = tz.localize(
                datetime.fromisoformat(e["end"]["dateTime"].replace("Z", "+00:00"))
            )
            events.append(
                {
                    "subject": e["subject"],
                    "start": start_dt.strftime("%Y-%m-%d %H:%M"),
                    "end": end_dt.strftime("%Y-%m-%d %H:%M"),
                    "location": e["location"]["displayName"],
                }
            )

        return {"email": email, "events": events}

    def generate_draft_response(
        self, email_id: str, user_timezone: str = "Asia/Calcutta"
    ) -> Optional[str]:
        email_response = self.request(
            f"me/messages/{email_id}",
            params={"$select": "id,subject,body,receivedDateTime,from,toRecipients"},
        )
        if not email_response:
            return None

        email = email_response.json()
        content = re.sub(r"<[^>]+>", " ", email["body"]["content"])
        sender_name = email["from"]["emailAddress"]["name"]

        tz = pytz.timezone(user_timezone)
        now = datetime.now(tz)
        end_of_week = now + timedelta(days=7)

        calendar_response = self.request(
            "me/calendarView",
            params={
                "startDateTime": now.isoformat(),
                "endDateTime": end_of_week.isoformat(),
                "$select": "subject,start,end",
                "$orderby": "start/dateTime",
                "$top": 50,
            },
        )
        calendar_events = (
            calendar_response.json().get("value", []) if calendar_response else []
        )

        if calendar_events:
            availability = "##### My upcoming meetings:" + "".join(
                [
                    f"\n- {e['subject']} on {datetime.fromisoformat(e['start']['dateTime'].replace('Z', '+00:00')).strftime('%B %d')} "
                    f"from {datetime.fromisoformat(e['start']['dateTime'].replace('Z', '+00:00')).strftime('%I:%M %p')} to "
                    f"{datetime.fromisoformat(e['end']['dateTime'].replace('Z', '+00:00')).strftime('%I:%M %p')}"
                    for e in calendar_events
                ]
            )
        else:
            availability = "I have no scheduled meetings in the next few days."

        system_prompt = (
            "You are an email assistant that drafts professional responses. Consider the calendar "
            "availability when mentioned. Be concise but polite."
        )
        user_prompt = (
            f"Original email from {sender_name}:\nSubject: {email['subject']}\n\n{content}\n\n"
            f"{availability}\n\nDraft a professional response to this email."
        )

        draft_text = generate_text(system_prompt, user_prompt)

        draft_payload = {
            "subject": f"RE: {email['subject']}",
            "importance": email.get("importance", "normal"),
            "body": {
                "contentType": "HTML",
                "content": draft_text.replace("\n", "<br>"),
            },
            "toRecipients": [email["from"]],
        }

        draft_response = self.request("me/messages", method="POST", json=draft_payload)
        if draft_response:
            return draft_text
        return None

    def mark_email_as_read(self, email_id: str) -> bool:
        response = self.request(
            f"me/messages/{email_id}", method="PATCH", json={"isRead": True}
        )
        return response is not None
