"""TaskService: task management and weekly planning."""

from __future__ import annotations

from typing import TYPE_CHECKING

from memory.models import Task
from memory.services.observability import build_llm_logger
from memory.storage.store import Store

if TYPE_CHECKING:
    from memory.services.journey import JourneyService


class TaskService:
    def __init__(
        self,
        store: Store,
        journeys: JourneyService | None = None,
    ) -> None:
        self.store = store
        if journeys is None:
            raise TypeError("TaskService requires journeys")
        self.journeys: JourneyService = journeys

    def add_task(
        self,
        title: str,
        journey: str | None = None,
        due_date: str | None = None,
        scheduled_at: str | None = None,
        time_hint: str | None = None,
        stage: str | None = None,
        context: str | None = None,
        source: str = "manual",
    ) -> Task:
        """Create a new task."""
        task = Task(
            journey=journey,
            title=title,
            due_date=due_date,
            scheduled_at=scheduled_at,
            time_hint=time_hint,
            stage=stage,
            context=context,
            source=source,
        )
        return self.store.create_task(task)

    def list_tasks(
        self,
        journey: str | None = None,
        status: str | None = None,
        open_only: bool = False,
    ) -> list[Task]:
        """List tasks with filters."""
        if open_only:
            return self.store.get_open_tasks(journey)
        if status:
            tasks = self.store.get_tasks_by_status(status)
            if journey:
                tasks = [t for t in tasks if t.journey == journey]
            return tasks
        if journey:
            return self.store.get_tasks_by_journey(journey)
        return self.store.get_all_tasks()

    def find_tasks(
        self,
        title_fragment: str,
        journey: str | None = None,
    ) -> list[Task]:
        """Find tasks by title fragment."""
        return self.store.find_tasks_by_title(title_fragment, journey)

    def complete_task(self, task_id: str) -> None:
        """Mark a task as completed."""
        from memory.models import _now

        self.store.update_task(task_id, status="done", completed_at=_now())

    def update_task(self, task_id: str, **kwargs) -> None:
        """Update task fields."""
        self.store.update_task(task_id, **kwargs)

    def ingest_week_plan(self, text: str) -> list[dict]:
        """Extract items from a natural-language weekly plan.

        Returns proposed item dictionaries. Does not save without confirmation.
        """
        from memory.intelligence.extraction import extract_week_plan

        # Collect active journeys for LLM context.
        all_journeys = self.store.get_identity_by_layer("journey")
        journey_context = []
        for t in all_journeys:
            desc = t.content[:200] if t.content else ""
            journey_context.append({"slug": t.key, "description": desc})

        llm_logger = build_llm_logger(self.store, role="week_plan")

        items = extract_week_plan(text, journey_context, on_llm_call=llm_logger)

        # Check similarity with existing tasks.
        result = []
        for item in items:
            similar = self.store.find_tasks_by_title(item.title[:20])
            week_similar = [
                t for t in similar if t.due_date == item.due_date and t.status != "done"
            ]
            result.append(
                {
                    "item": item,
                    "similar_existing": week_similar,
                }
            )

        return result

    def save_week_items(self, items: list) -> list[Task]:
        """Save confirmed weekly-plan items.

        Receives a list of ExtractedWeekItem values.
        """
        from memory.models import ExtractedWeekItem

        created = []
        for item in items:
            if isinstance(item, dict):
                item = item["item"] if "item" in item else ExtractedWeekItem(**item)
            task = self.add_task(
                title=item.title,
                journey=item.journey,
                due_date=item.due_date,
                scheduled_at=item.scheduled_at,
                time_hint=item.time_hint,
                context=item.context,
                source="week_plan",
            )
            created.append(task)
        return created

    def import_tasks_from_journey_path(self, journey: str) -> list[Task]:
        """Extract pending tasks from a journey path."""
        from memory.cli.tasks import parse_journey_path_tasks

        journey_path = self.journeys.get_journey_path(journey)
        if not journey_path:
            return []
        parsed = parse_journey_path_tasks(journey_path, journey)
        created = []
        for task_data in parsed:
            # Avoid duplicates by title and journey.
            existing = self.store.find_tasks_by_title(task_data["title"], journey)
            if existing:
                continue
            task = self.add_task(
                title=task_data["title"],
                journey=journey,
                stage=task_data.get("stage"),
                source="journey_path",
            )
            created.append(task)
        return created

    def sync_tasks_from_file(self, journey: str) -> dict:
        """Sync tasks for a journey from its reference file.

        Returns counts for created, completed, and unchanged tasks.
        """
        from pathlib import Path

        from memory.cli.tasks import parse_done_tasks, parse_journey_path_tasks

        sync_file = self.journeys.get_sync_file(journey)
        if not sync_file:
            raise ValueError(
                f"No sync file configured for '{journey}'. "
                f"Use: mm:tasks sync-config {journey} /path/to/file"
            )

        path = Path(sync_file).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"File not found: {sync_file}")

        content = path.read_text(encoding="utf-8")

        file_pending = parse_journey_path_tasks(content, journey)
        file_done = parse_done_tasks(content, journey)

        existing_tasks = self.store.get_tasks_by_journey(journey)
        existing_by_title = {t.title: t for t in existing_tasks}

        result = {"created": 0, "completed": 0, "unchanged": 0}

        # Create new tasks that are pending in the file and absent from the database.
        for task_data in file_pending:
            if task_data["title"] not in existing_by_title:
                self.add_task(
                    title=task_data["title"],
                    journey=journey,
                    stage=task_data.get("stage"),
                    source="sync",
                )
                result["created"] += 1
            else:
                result["unchanged"] += 1

        # Mark database tasks done when the file marks them completed.
        for task_data in file_done:
            if task_data["title"] in existing_by_title:
                existing = existing_by_title[task_data["title"]]
                if existing.status != "done":
                    self.complete_task(existing.id)
                    result["completed"] += 1
                else:
                    result["unchanged"] += 1

        return result
