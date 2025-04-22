from flask import Flask, redirect, request, session, render_template
import os
from dotenv import load_dotenv
from auth_helper import build_auth_url, get_token_from_code
from outlook_reader import get_unread_emails, get_calendar_events, create_draft
from llama_client import generate_draft

load_dotenv()
app = Flask(__name__)
app.secret_key = os.urandom(24)


@app.route("/")
def index():
    if "access_token" not in session:
        return redirect("/login")
    token = session["access_token"]
    emails = get_unread_emails(token)
    calendar = get_calendar_events(token)
    calendar_text = "\n".join(
        [f"{e['subject']} on {e['start']['dateTime']}" for e in calendar]
    )

    drafts = []
    for email in emails:
        subject = email["subject"]
        body = email["body"]["content"]
        reply = generate_draft(subject, body, calendar_text)
        create_draft(token, email["id"], reply)
        drafts.append((email, reply))

    return render_template("home.html", drafts=drafts)


@app.route("/login")
def login():
    return redirect(build_auth_url())


@app.route("/callback")
def callback():
    code = request.args.get("code")
    token_result = get_token_from_code(code)
    print("Token result:", token_result)
    if "error" in token_result:
        return f"Error: {token_result['error_description']}", 400
    if "access_token" not in token_result:
        return "Error: No access token received", 400
    session["access_token"] = token_result["access_token"]
    return redirect("/")


if __name__ == "__main__":
    app.run(port=5500, debug=True)
