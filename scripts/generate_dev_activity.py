#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
RESUME_PATH = REPO_ROOT / "content" / "resume.md"
OUTPUT_PATH = REPO_ROOT / "data" / "dev_activity.json"
GITHUB_API_ROOT = "https://api.github.com"
USER_AGENT = "stevemurr-github-activity-generator"
CALENDAR_DAYS = 90
RECENT_COMMIT_COUNT = 5
LOCAL_RECENT_FETCH_LIMIT = 120
API_RECENT_FETCH_LIMIT = 10


def parse_scalar(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def load_front_matter(path: Path) -> dict[str, object]:
    content = path.read_text(encoding="utf-8")
    parts = content.split("---", 2)
    if len(parts) < 3:
        raise RuntimeError(f"Expected front matter in {path}")

    front_matter = parts[1]
    username = ""
    exclude_repos: list[str] = []
    section = None
    collecting_excludes = False

    for raw_line in front_matter.splitlines():
        if not raw_line.strip():
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))
        line = raw_line.strip()

        if indent == 0:
            section = line[:-1] if line.endswith(":") else None
            collecting_excludes = False
            continue

        if section != "githubActivity":
            continue

        if indent == 2 and line.startswith("username:"):
            username = parse_scalar(line.split(":", 1)[1])
            collecting_excludes = False
        elif indent == 2 and line == "excludeRepos:":
            collecting_excludes = True
        elif indent == 4 and collecting_excludes and line.startswith("- "):
            exclude_repos.append(parse_scalar(line[2:]))
        elif indent <= 2:
            collecting_excludes = False

    if not username:
        raise RuntimeError(f"Could not find githubActivity.username in {path}")

    return {
        "username": username,
        "exclude_repos": exclude_repos,
    }


def run_command(args: list[str], cwd: Path | None = None, check: bool = True) -> str:
    completed = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        check=check,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def parse_github_slug(url: str) -> str | None:
    value = url.strip()
    patterns = (
        r"github\.com[:/](?P<slug>[^/\s]+/[^/\s]+?)(?:\.git)?$",
        r"^https?://github\.com/(?P<slug>[^/\s]+/[^/\s]+?)(?:\.git)?$",
    )

    for pattern in patterns:
        match = re.search(pattern, value, re.IGNORECASE)
        if match:
            return match.group("slug")

    return None


def discover_local_repositories(username: str) -> list[dict[str, str]]:
    owner = username.lower()
    parent = REPO_ROOT.parent
    repositories: dict[str, dict[str, str]] = {}

    for child in sorted(parent.iterdir()):
        if not child.is_dir() or not (child / ".git").exists():
            continue

        try:
            remote_url = run_command(["git", "-C", str(child), "remote", "get-url", "origin"])
        except subprocess.CalledProcessError:
            continue

        slug = parse_github_slug(remote_url)
        if not slug:
            continue

        if slug.split("/", 1)[0].lower() != owner:
            continue

        repo_name = slug.split("/", 1)[1]
        slug_lower = slug.lower()
        candidate = {
            "slug": slug,
            "slug_lower": slug_lower,
            "path": str(child),
            "name": repo_name,
        }
        existing = repositories.get(slug_lower)

        if existing is None:
            repositories[slug_lower] = candidate
            continue

        existing_path = Path(existing["path"]).name.lower()
        candidate_path = child.name.lower()
        repo_name_lower = repo_name.lower()

        existing_score = (
            0 if existing_path == repo_name_lower else 1,
            len(existing_path),
        )
        candidate_score = (
            0 if candidate_path == repo_name_lower else 1,
            len(candidate_path),
        )

        if candidate_score < existing_score:
            repositories[slug_lower] = candidate

    return list(repositories.values())


def get_local_identity() -> dict[str, str]:
    def safe_git_config(key: str) -> str:
        try:
            return run_command(["git", "config", key], cwd=REPO_ROOT)
        except subprocess.CalledProcessError:
            return ""

    return {
        "name": safe_git_config("user.name").lower(),
        "email": safe_git_config("user.email").lower(),
    }


def author_matches_identity(
    author_name: str,
    author_email: str,
    username: str,
    identity: dict[str, str],
) -> bool:
    author_name_lower = author_name.strip().lower()
    author_email_lower = author_email.strip().lower()
    username_lower = username.strip().lower()
    configured_name = identity.get("name", "")
    configured_email = identity.get("email", "")

    if configured_email and author_email_lower == configured_email:
        return True

    if username_lower and author_email_lower.endswith(f"{username_lower}@users.noreply.github.com"):
        return True

    if configured_name and author_name_lower == configured_name:
        return True

    if username_lower and author_name_lower in {username_lower, username_lower.replace("-", " ")}:
        return True

    return False


def parse_iso_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def format_relative_time(value: str, now: datetime) -> str:
    delta = parse_iso_datetime(value) - now
    total_seconds = int(delta.total_seconds())
    abs_seconds = abs(total_seconds)

    units = (
        (365 * 24 * 60 * 60, "year"),
        (30 * 24 * 60 * 60, "month"),
        (7 * 24 * 60 * 60, "week"),
        (24 * 60 * 60, "day"),
        (60 * 60, "hour"),
        (60, "minute"),
    )

    if abs_seconds < 60:
        return "just now"

    for unit_seconds, unit_name in units:
        if abs_seconds >= unit_seconds:
            value_count = max(1, round(abs_seconds / unit_seconds))
            suffix = "" if value_count == 1 else "s"
            if total_seconds >= 0:
                return f"in {value_count} {unit_name}{suffix}"
            return f"{value_count} {unit_name}{suffix} ago"

    return "recently"


def load_local_commits(
    repositories: list[dict[str, str]],
    username: str,
    identity: dict[str, str],
) -> list[dict[str, str]]:
    commits: list[dict[str, str]] = []
    log_format = "%H%x1f%h%x1f%cI%x1f%an%x1f%ae%x1f%D%x1f%s%x1e"

    for repository in repositories:
        output = run_command(
            [
                "git",
                "-C",
                repository["path"],
                "log",
                "--all",
                "--date-order",
                f"--pretty=format:{log_format}",
                f"-n{LOCAL_RECENT_FETCH_LIMIT}",
            ],
            check=False,
        )

        if not output:
            continue

        for record in output.split("\x1e"):
            if not record.strip():
                continue

            fields = record.strip().split("\x1f")
            if len(fields) != 7:
                continue

            full_hash, short_hash, committed_at, author_name, author_email, refs, subject = fields
            if not author_matches_identity(author_name, author_email, username, identity):
                continue

            commits.append(
                {
                    "repo": repository["slug"],
                    "repoName": repository["name"],
                    "fullHash": full_hash,
                    "shortHash": short_hash,
                    "date": committed_at,
                    "message": subject,
                    "refs": refs,
                    "url": f"https://github.com/{repository['slug']}/commit/{full_hash}",
                }
            )

    return commits


def load_local_contribution_counts(
    repositories: list[dict[str, str]],
    username: str,
    identity: dict[str, str],
    start_date: date,
) -> Counter[str]:
    counts: Counter[str] = Counter()
    log_format = "%cI%x1f%an%x1f%ae%x1e"

    for repository in repositories:
        output = run_command(
            [
                "git",
                "-C",
                repository["path"],
                "log",
                "--all",
                f"--since={start_date.isoformat()}",
                f"--pretty=format:{log_format}",
            ],
            check=False,
        )

        if not output:
            continue

        for record in output.split("\x1e"):
            if not record.strip():
                continue

            fields = record.strip().split("\x1f")
            if len(fields) != 3:
                continue

            committed_at, author_name, author_email = fields
            if not author_matches_identity(author_name, author_email, username, identity):
                continue

            counts[parse_iso_datetime(committed_at).date().isoformat()] += 1

    return counts


def github_request(url: str, token: str | None, method: str = "GET", body: bytes | None = None):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
    }

    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def github_graphql(query: str, variables: dict[str, object], token: str) -> dict[str, object]:
    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    data = github_request(
        f"{GITHUB_API_ROOT}/graphql",
        token=token,
        method="POST",
        body=payload,
    )

    if data.get("errors"):
        raise RuntimeError(f"GitHub GraphQL error: {data['errors']}")

    return data["data"]


def load_api_repositories(username: str, token: str | None) -> list[dict[str, str]]:
    repositories = github_request(
        f"{GITHUB_API_ROOT}/users/{urllib.parse.quote(username)}/repos?per_page=100&sort=updated&type=owner",
        token=token,
    )

    result: list[dict[str, str]] = []
    for repository in repositories:
        if repository.get("fork"):
            continue

        result.append(
            {
                "slug": repository["full_name"],
                "slug_lower": repository["full_name"].lower(),
                "name": repository["name"],
            }
        )

    return result


def load_api_commits(
    repositories: list[dict[str, str]],
    username: str,
    token: str | None,
) -> list[dict[str, str]]:
    commits: list[dict[str, str]] = []

    for repository in repositories:
        encoded_repo = urllib.parse.quote(repository["slug"], safe="/")
        encoded_author = urllib.parse.quote(username, safe="")
        payload = github_request(
            f"{GITHUB_API_ROOT}/repos/{encoded_repo}/commits?per_page={API_RECENT_FETCH_LIMIT}&author={encoded_author}",
            token=token,
        )

        for item in payload:
            commit_info = item.get("commit") or {}
            author_info = commit_info.get("author") or {}
            committer_info = commit_info.get("committer") or {}
            committed_at = committer_info.get("date") or author_info.get("date")
            message = (commit_info.get("message") or "").splitlines()[0].strip()

            if not committed_at or not message:
                continue

            commits.append(
                {
                    "repo": repository["slug"],
                    "repoName": repository["name"],
                    "fullHash": item["sha"],
                    "shortHash": item["sha"][:7],
                    "date": committed_at,
                    "message": message,
                    "refs": "",
                    "url": item.get("html_url") or f"https://github.com/{repository['slug']}/commit/{item['sha']}",
                }
            )

    return commits


def load_api_contributions(username: str, token: str, start_date: date, end_date: date) -> Counter[str]:
    query = """
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
    """
    data = github_graphql(
        query=query,
        variables={
            "login": username,
            "from": f"{start_date.isoformat()}T00:00:00Z",
            "to": f"{end_date.isoformat()}T23:59:59Z",
        },
        token=token,
    )

    counts: Counter[str] = Counter()
    calendar = (
        data.get("user", {})
        .get("contributionsCollection", {})
        .get("contributionCalendar", {})
    )

    for week in calendar.get("weeks", []):
        for day in week.get("contributionDays", []):
            contribution_count = int(day.get("contributionCount", 0))
            if contribution_count > 0:
                counts[day["date"]] = contribution_count

    return counts


def calculate_level(count: int, maximum: int) -> int:
    if count <= 0 or maximum <= 0:
        return 0

    ratio = count / maximum
    if ratio >= 0.75:
        return 4
    if ratio >= 0.5:
        return 3
    if ratio >= 0.25:
        return 2
    return 1


def build_calendar(counts: Counter[str], end_date: date) -> dict[str, object]:
    visible_start = end_date - timedelta(days=CALENDAR_DAYS - 1)
    start_offset = (visible_start.weekday() + 1) % 7
    calendar_start = visible_start - timedelta(days=start_offset)
    end_offset = (5 - end_date.weekday()) % 7
    calendar_end = end_date + timedelta(days=end_offset)
    maximum = max(counts.values(), default=0)
    total = 0
    weeks: list[dict[str, object]] = []
    day_cursor = calendar_start

    while day_cursor <= calendar_end:
        days: list[dict[str, object]] = []
        for _ in range(7):
            day_key = day_cursor.isoformat()
            in_range = visible_start <= day_cursor <= end_date
            count = counts.get(day_key, 0) if in_range else 0
            total += count
            days.append(
                {
                    "date": day_key,
                    "count": count,
                    "level": calculate_level(count, maximum),
                    "inRange": in_range,
                }
            )
            day_cursor += timedelta(days=1)
        weeks.append({"days": days})

    month_labels: list[dict[str, object]] = []
    previous_month = None
    for index, week in enumerate(weeks):
        in_range_days = [
            date.fromisoformat(day["date"])
            for day in week["days"]
            if day["inRange"]
        ]
        if not in_range_days:
            continue

        label_day = next((day for day in in_range_days if day.day <= 7), None)
        if label_day is None and index == 0:
            label_day = in_range_days[0]
        if label_day is None:
            continue

        month_key = (label_day.year, label_day.month)
        if month_key == previous_month:
            continue

        month_labels.append({"label": label_day.strftime("%b"), "column": index})
        previous_month = month_key

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "windowDays": CALENDAR_DAYS,
        "startDate": visible_start.isoformat(),
        "endDate": end_date.isoformat(),
        "total": total,
        "max": maximum,
        "weeks": weeks,
        "monthLabels": month_labels,
    }


def prepare_recent_commits(commits: list[dict[str, str]], now: datetime) -> list[dict[str, str]]:
    sorted_commits = sorted(
        commits,
        key=lambda commit: parse_iso_datetime(commit["date"]),
        reverse=True,
    )[:RECENT_COMMIT_COUNT]

    result: list[dict[str, str]] = []
    for commit in sorted_commits:
        timestamp = parse_iso_datetime(commit["date"])
        cleaned_refs = ", ".join(
            part.strip() for part in commit.get("refs", "").split(",") if part.strip()
        )
        result.append(
            {
                **commit,
                "refs": cleaned_refs,
                "displayDate": timestamp.strftime("%b %-d"),
                "displayDateTime": timestamp.strftime("%b %-d, %-I:%M %p"),
                "relativeTime": format_relative_time(commit["date"], now),
            }
        )

    return result


def main() -> int:
    config = load_front_matter(RESUME_PATH)
    username = str(config["username"])
    token = os.environ.get("GITHUB_TOKEN")
    end_date = date.today()
    now = datetime.now(timezone.utc)
    identity = get_local_identity()
    local_repositories = discover_local_repositories(username)
    public_repositories: list[dict[str, str]] = []

    try:
        public_repositories = load_api_repositories(username, token)
    except (urllib.error.HTTPError, urllib.error.URLError) as error:
        if not os.environ.get("ALLOW_UNVERIFIED_LOCAL_REPOS"):
            raise RuntimeError(
                "Unable to verify public GitHub repos. Re-run with network access or set "
                "ALLOW_UNVERIFIED_LOCAL_REPOS=1 to force local-only generation."
            ) from error

    public_repo_lookup = {repository["slug_lower"]: repository for repository in public_repositories}
    verified_local_repositories = [
        {
            **repository,
            "slug": public_repo_lookup.get(repository["slug_lower"], repository)["slug"],
            "name": public_repo_lookup.get(repository["slug_lower"], repository)["name"],
        }
        for repository in local_repositories
        if not public_repo_lookup or repository["slug_lower"] in public_repo_lookup
    ]

    repositories: list[dict[str, str]]
    commits: list[dict[str, str]]
    contribution_counts: Counter[str]
    source = "local"

    try:
        if len(verified_local_repositories) >= 3:
            repositories = verified_local_repositories
            commits = load_local_commits(repositories, username, identity)
            contribution_counts = load_local_contribution_counts(
                repositories,
                username,
                identity,
                end_date - timedelta(days=CALENDAR_DAYS - 1),
            )
        elif token:
            repositories = public_repositories
            commits = load_api_commits(repositories, username, token)
            contribution_counts = load_api_contributions(
                username,
                token,
                end_date - timedelta(days=CALENDAR_DAYS - 1),
                end_date,
            )
            source = "github"
        else:
            repositories = verified_local_repositories
            commits = load_local_commits(repositories, username, identity)
            contribution_counts = load_local_contribution_counts(
                repositories,
                username,
                identity,
                end_date - timedelta(days=CALENDAR_DAYS - 1),
            )
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"GitHub request failed: {error.code} {error.reason}") from error

    payload = {
        "source": source,
        "username": username,
        "repoCount": len(repositories),
        "contributions": build_calendar(contribution_counts, end_date),
        "recentCommits": prepare_recent_commits(commits, now),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - script entrypoint
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
