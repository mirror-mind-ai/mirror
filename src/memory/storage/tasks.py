"""Task persistence operations."""

from memory.models import Task
from memory.storage.base import ConnectionBacked


class TaskStore(ConnectionBacked):
    # --- Tasks ---

    def create_task(self, task: Task) -> Task:
        self.conn.execute(
            """INSERT INTO tasks
               (id, journey, title, status, due_date, scheduled_at, time_hint,
                stage, context, source, created_at, updated_at, completed_at, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                task.id,
                task.journey,
                task.title,
                task.status,
                task.due_date,
                task.scheduled_at,
                task.time_hint,
                task.stage,
                task.context,
                task.source,
                task.created_at,
                task.updated_at,
                task.completed_at,
                task.metadata,
            ),
        )
        self.conn.commit()
        return task

    def get_tasks_for_week(self, start_date: str, end_date: str) -> list[Task]:
        """Return week tasks/appointments by due_date or scheduled_at."""
        rows = self.conn.execute(
            """SELECT * FROM tasks
               WHERE (due_date >= ? AND due_date <= ?)
                  OR (scheduled_at >= ? AND scheduled_at <= ?)
               ORDER BY due_date ASC NULLS LAST, scheduled_at ASC NULLS LAST""",
            (start_date, end_date, start_date, end_date + "T23:59"),
        ).fetchall()
        return [Task(**dict(r)) for r in rows]

    def get_task(self, task_id: str) -> Task | None:
        row = self.conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return None
        return Task(**dict(row))

    def update_task(self, task_id: str, **kwargs: object) -> None:
        from memory.models import _now

        kwargs["updated_at"] = _now()
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        vals = [*list(kwargs.values()), task_id]
        self.conn.execute(f"UPDATE tasks SET {sets} WHERE id = ?", vals)
        self.conn.commit()

    def delete_task(self, task_id: str) -> bool:
        cursor = self.conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    def get_tasks_by_journey(self, journey: str) -> list[Task]:
        rows = self.conn.execute(
            "SELECT * FROM tasks WHERE journey = ? ORDER BY due_date ASC NULLS LAST, created_at ASC",
            (journey,),
        ).fetchall()
        return [Task(**dict(r)) for r in rows]

    def get_tasks_by_status(self, status: str) -> list[Task]:
        rows = self.conn.execute(
            "SELECT * FROM tasks WHERE status = ? ORDER BY due_date ASC NULLS LAST, created_at ASC",
            (status,),
        ).fetchall()
        return [Task(**dict(r)) for r in rows]

    def get_open_tasks(self, journey: str | None = None) -> list[Task]:
        if journey:
            rows = self.conn.execute(
                """SELECT * FROM tasks WHERE status IN ('todo', 'doing', 'blocked')
                   AND journey = ?
                   ORDER BY due_date ASC NULLS LAST, created_at ASC""",
                (journey,),
            ).fetchall()
        else:
            rows = self.conn.execute(
                """SELECT * FROM tasks WHERE status IN ('todo', 'doing', 'blocked')
                   ORDER BY due_date ASC NULLS LAST, created_at ASC"""
            ).fetchall()
        return [Task(**dict(r)) for r in rows]

    def get_all_tasks(self) -> list[Task]:
        rows = self.conn.execute(
            "SELECT * FROM tasks ORDER BY status, due_date ASC NULLS LAST, created_at ASC"
        ).fetchall()
        return [Task(**dict(r)) for r in rows]

    def find_tasks_by_title(self, title_fragment: str, journey: str | None = None) -> list[Task]:
        if journey:
            rows = self.conn.execute(
                "SELECT * FROM tasks WHERE title LIKE ? AND journey = ? ORDER BY created_at DESC",
                (f"%{title_fragment}%", journey),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM tasks WHERE title LIKE ? ORDER BY created_at DESC",
                (f"%{title_fragment}%",),
            ).fetchall()
        return [Task(**dict(r)) for r in rows]
