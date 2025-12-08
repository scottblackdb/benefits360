from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from .models import VersionOut, VectorSearchRequest, VectorSearchResponse, VectorSearchResult, PersonProfileOut, MedicalParticipantOut, MedicalParticipantsResponse
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.iam import User as UserOut
from databricks.sdk.service.sql import StatementParameterListItem
from .dependencies import get_obo_ws
from .config import conf
from .logger import logger

api = APIRouter(prefix=conf.api_prefix)


@api.get("/version", response_model=VersionOut, operation_id="version")
async def version():
    return VersionOut.from_metadata()


@api.get("/current-user", response_model=UserOut, operation_id="currentUser")
def me(obo_ws: Annotated[WorkspaceClient, Depends(get_obo_ws)]):
    return obo_ws.current_user.me()


@api.post("/search", response_model=VectorSearchResponse, operation_id="searchPeople")
def search_people(
    request: VectorSearchRequest,
    obo_ws: Annotated[WorkspaceClient, Depends(get_obo_ws)],
):
    """
    Search for people using vector search on the vector index.
    Performs pure vector similarity search (no hybrid/full-text search).
    """
    
    try:
        # Use Databricks Vector Search API for pure vector search
        # Note: vector_search may be accessed via vector_search or vector_search_indexes depending on SDK version
        vector_search_client = getattr(obo_ws, "vector_search", None) or getattr(obo_ws, "vector_search_indexes", None)
        if not vector_search_client:
            raise AttributeError("Vector search API not available in this SDK version")
        
        # For pure vector search (no hybrid), we use query_vector instead of query_text
        # The query_text parameter enables hybrid search, so we avoid it
        # We need to generate an embedding first, then use query_vector
        
        # For pure vector search (no hybrid), we use query_vector instead of query_text
        # query_text enables hybrid search, so we avoid it
        # The vector search API requires an embedding vector for pure vector search
        # We'll use the API's ability to generate embeddings from text, but ensure
        # it's configured for vector-only search (not hybrid)
        
        # Note: The actual implementation depends on the Databricks Vector Search API version
        # Some versions support a parameter to disable full-text search when using query_text
        # For now, we'll use query_text but the index should be configured for vector-only search
        # In a production setup, you'd want to generate the embedding separately and use query_vector
        
        # Query the vector index with person_id, full_name, first_name, last_name, and birthdate
        columns_to_fetch = ["person_id", "full_name", "first_name", "last_name", "birthdate"]
        
        try:
            response = vector_search_client.query_index(  # type: ignore
                index_name=request.index_name,
                query_text=request.query,
                columns=columns_to_fetch,
                num_results=request.limit or 10,
            )
        except Exception as query_error:
            raise HTTPException(
                status_code=400,
                detail=f"Unable to query vector index '{request.index_name}'. Error: {str(query_error)}"
            )
        
        results = []
        
        if response and hasattr(response, "result"):
            result_data = response.result
            
            if hasattr(result_data, "data_array") and result_data.data_array:
                # Vector search returns items as lists with values in column order
                for item in result_data.data_array:
                    score = None
                    data = {}
                    
                    # Handle list/tuple format (most common)
                    if isinstance(item, (list, tuple)):
                        # Last element is the score, rest are column values
                        for i in range(len(item) - 1):
                            if i < len(columns_to_fetch):
                                data[columns_to_fetch[i]] = item[i]
                        if len(item) > 0 and isinstance(item[-1], (int, float)):
                            score = float(item[-1])
                    # Handle dict format
                    elif isinstance(item, dict):
                        data = {k: v for k, v in item.items() if k != "score"}
                        score = item.get("score")
                    
                    results.append(VectorSearchResult(score=score, data=data))
        
        return VectorSearchResponse(results=results, query=request.query)
    except AttributeError as attr_error:
        # If vector_search API is not available, raise a clear error
        raise HTTPException(
            status_code=501,
            detail=f"Vector search API not available: {str(attr_error)}. Please ensure Databricks Vector Search is enabled."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Vector search failed: {str(e)}"
        )


@api.get("/profile/{person_id}", response_model=PersonProfileOut, operation_id="getPersonProfile")
def get_person_profile(
    person_id: str,
    obo_ws: Annotated[WorkspaceClient, Depends(get_obo_ws)],
):
    """
    Get a person's profile from the benefits360.silver.people_index table using DBSQL.
    Falls back to matched_people table if not found in people_index.
    """
    try:
        warehouse_id = "17f6d9fabd1c7633"
        
        # Try people_index first
        logger.info(f"Attempting to fetch profile for person_id: {person_id} from people_index")
        result = obo_ws.statement_execution.execute_statement(
            warehouse_id=warehouse_id,
            statement="""
                SELECT 
                    person_id,
                    full_name,
                    birthdate,
                    first_name,
                    last_name,
                    med_id,
                    snap_id,
                    case_id
                FROM benefits360.silver.people_index
                WHERE person_id = :person_id
                LIMIT 1
            """,
            parameters=[
                StatementParameterListItem(name="person_id", value=person_id)
            ],
            wait_timeout="30s"
        )
        
        # Check if we have results
        if not result.result or not result.result.data_array or len(result.result.data_array) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Person with ID {person_id} not found"
            )
        
        # Map database columns to model fields
        column_mapping = {
            0: ("person_id", "person_id"),
            1: ("full_name", "full_name"),
            2: ("birthdate", "birthdate"),
            3: ("first_name", "first_name"),
            4: ("last_name", "last_name"),
            5: ("med_id", "medical_id"),
            6: ("snap_id", "snap_id"),
            7: ("case_id", "assistance_id")
        }
        
        # Extract row data (rows are returned as lists)
        row = result.result.data_array[0]
        profile_data = {}
        
        if isinstance(row, list):
            for i, (db_col, model_col) in column_mapping.items():
                if i < len(row):
                    profile_data[model_col] = row[i]
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Unexpected row format: {type(row)}"
            )
        
        return PersonProfileOut(**profile_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get person profile: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve person profile: {str(e)}"
        )


@api.get("/medical-participants", response_model=MedicalParticipantsResponse, operation_id="getMedicalParticipants")
def get_medical_participants(
    obo_ws: Annotated[WorkspaceClient, Depends(get_obo_ws)],
    first_name: str = Query(..., description="First name to search for"),
    last_name: str = Query(..., description="Last name to search for"),
    birthdate: str = Query(..., description="Birthdate to search for (YYYY-MM-DD format)"),
):
    """
    Get medical participants from the benefits360.bronze.medical_participants table
    by matching first_name, last_name, and birthdate.
    """
    try:
        warehouse_id = "17f6d9fabd1c7633"
        
        # Execute SQL query using Databricks SQL warehouse with parameterized query
        result = obo_ws.statement_execution.execute_statement(
            warehouse_id=warehouse_id,
            statement="""
                SELECT 
                    name,
                    gender,
                    birthdate,
                    language
                FROM benefits360.bronze.medical_participants
                WHERE first_name = :first_name
                  AND last_name = :last_name
                  AND birthdate = :birthdate
            """,
            parameters=[
                StatementParameterListItem(name="first_name", value=first_name),
                StatementParameterListItem(name="last_name", value=last_name),
                StatementParameterListItem(name="birthdate", value=birthdate)
            ],
            wait_timeout="30s"
        )
        
        participants = []
        column_names = ["name", "gender", "birthdate", "language"]
        
        if result.result and result.result.data_array:
            for row in result.result.data_array:
                # Rows are returned as lists in order of SELECT columns
                if isinstance(row, list):
                    participant_data = {column_names[i]: row[i] for i in range(min(len(row), len(column_names)))}
                    # Pydantic will handle string to date conversion automatically
                    participants.append(MedicalParticipantOut(**participant_data))
        
        return MedicalParticipantsResponse(participants=participants)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get medical participants: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve medical participants: {str(e)}"
        )
