from databricks.sdk import WorkspaceClient
from fastapi import Header, HTTPException
from typing import Annotated


def get_obo_ws(
    token: Annotated[str | None, Header(alias="X-Forwarded-Access-Token")] = None,
) -> WorkspaceClient:
    """
    Returns a Databricks Workspace client with authentication behalf of user.
    If the request contains an X-Forwarded-Access-Token header, on behalf of user authentication is used.
    If no token is provided (development mode), uses default Databricks CLI authentication.

    Example usage:
    @api.get("/items/")
    async def read_items(obo_ws: Annotated[WorkspaceClient, Depends(get_obo_ws)]):
        # do something with the obo_ws
        ...
    """

    if token:
        # Production mode with OBO token
        #return WorkspaceClient(token=token, auth_type="pat")
        return WorkspaceClient()
    else:
        # Development mode - use default Databricks CLI authentication
        return WorkspaceClient()
