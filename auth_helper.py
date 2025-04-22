import os
import msal
from flask import session


def build_msal_app():
    return msal.ConfidentialClientApplication(
        os.getenv("CLIENT_ID"),
        authority=os.getenv("AUTHORITY"),
        client_credential=os.getenv("CLIENT_SECRET"),
    )


def build_auth_url():
    # Only include Graph API scopes here — NOT reserved ones
    scopes = ["Mail.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.Read"]
    return build_msal_app().get_authorization_request_url(
        scopes=scopes, redirect_uri=os.getenv("REDIRECT_URI")
    )


def get_token_from_code(auth_code):
    result = build_msal_app().acquire_token_by_authorization_code(
        auth_code,
        scopes=os.getenv("SCOPE").split(),
        redirect_uri=os.getenv("REDIRECT_URI"),
    )
    return result
