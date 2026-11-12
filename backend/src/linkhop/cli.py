from __future__ import annotations

import asyncio

import click
import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from linkhop.api_keys import ApiKeyService
from linkhop.config import Settings
from linkhop.models.db import Base
from linkhop.routes.discord import COMMANDS


@click.group()
def cli() -> None:
    """linkhop-admin — verwalte linkhop-Instanz."""


@cli.command("init-db")
def init_db() -> None:
    # Async-Pfad via run_sync(create_all), damit wir keinen zusätzlichen
    # Sync-Treiber (psycopg2) als Dependency brauchen — die DSN ist bereits
    # in asyncpg/aiosqlite-Form, und Base.metadata.create_all akzeptiert die
    # Sync-API auf einer Sync-Connection, die run_sync liefert.
    async def _run() -> None:
        settings = Settings()
        engine = create_async_engine(settings.database_url)
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        finally:
            await engine.dispose()
    asyncio.run(_run())
    click.echo("schema created")


@cli.group()
def key() -> None:
    """API-Key management."""


def _make_async_session_factory():
    settings = Settings()
    engine = create_async_engine(settings.database_url)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


@key.command("create")
@click.option("--note", default=None, help="Freitext, was der Key ist")
@click.option(
    "--override",
    type=click.IntRange(min=1),
    default=None,
    help="Per-Minute-Override (>=1). 0/negativ wäre eine Selbst-DoS-Config.",
)
def key_create(note: str | None, override: int | None) -> None:
    async def _run():
        engine, factory = _make_async_session_factory()
        try:
            async with factory() as session:
                svc = ApiKeyService(session)
                plain, row = await svc.create(note=note, rate_limit_override=override)
                click.echo(f"key id={row.id} prefix={row.key_prefix}")
                click.echo(f"plaintext (one-time): {plain}")
        finally:
            await engine.dispose()
    asyncio.run(_run())


@key.command("list")
def key_list() -> None:
    async def _run():
        engine, factory = _make_async_session_factory()
        try:
            async with factory() as session:
                rows = await ApiKeyService(session).list_all()
                for r in rows:
                    status = f"revoked at {r.revoked_at}" if r.revoked_at else "active"
                    click.echo(f"id={r.id} prefix={r.key_prefix} note={r.note!r} [{status}]")
        finally:
            await engine.dispose()
    asyncio.run(_run())


@key.command("revoke")
@click.argument("key_id")
def key_revoke(key_id: str) -> None:
    async def _run() -> int:
        engine, factory = _make_async_session_factory()
        try:
            async with factory() as session:
                return await ApiKeyService(session).revoke(key_id)
        finally:
            await engine.dispose()
    hit = asyncio.run(_run())
    if hit == 0:
        click.echo(f"no such key: {key_id}", err=True)
        raise click.exceptions.Exit(code=1)
    click.echo(f"revoked: {key_id}")


@cli.group()
def discord() -> None:
    """Discord commands."""


@discord.command("register")
@click.option("--app-id", required=True, help="Application id from the Discord developer portal")
@click.option(
    "--token", envvar="DISCORD_BOT_TOKEN", required=True,
    help="Bot token of the application; read from DISCORD_BOT_TOKEN when not given",
)
@click.option("--guild-id", default=None, help="Register for one server only (shows up at once)")
def discord_register(app_id: str, token: str, guild_id: str | None) -> None:
    scope = f"/guilds/{guild_id}" if guild_id else ""
    resp = httpx.put(
        f"https://discord.com/api/v10/applications/{app_id}{scope}/commands",
        json=COMMANDS,
        headers={"Authorization": f"Bot {token}"},
        timeout=15,
    )
    if resp.status_code >= 400:
        click.echo(f"discord refused: {resp.status_code} {resp.text}", err=True)
        raise click.exceptions.Exit(code=1)
    click.echo(f"registered {len(COMMANDS)} commands")


def main() -> None:
    cli()
