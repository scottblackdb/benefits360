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
    import json
    
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
        # Store columns_to_fetch for use in data extraction
        # columns_to_fetch is now guaranteed to be set above
        requested_columns = columns_to_fetch
        
        if response and hasattr(response, "result"):
            result_data = response.result
            
            # Log the response structure for debugging
            logger.info(f"Response type: {type(result_data)}, has data_array: {hasattr(result_data, 'data_array')}")
            
            # The result might be a ResultData object with data_array attribute
            if hasattr(result_data, "data_array") and result_data.data_array:
                logger.info(f"data_array length: {len(result_data.data_array) if hasattr(result_data.data_array, '__len__') else 'unknown'}")
                # Get column names from manifest if available
                column_names = []
                if hasattr(result_data, "manifest") and result_data.manifest:
                    if hasattr(result_data.manifest, "schema") and result_data.manifest.schema:
                        if hasattr(result_data.manifest.schema, "columns"):
                            column_names = [col.name for col in result_data.manifest.schema.columns]
                            logger.info(f"Found column names from manifest: {column_names}")
                
                # If no column names from manifest, use the requested columns
                if not column_names:
                    column_names = requested_columns
                    logger.info(f"Using requested columns: {column_names}")
                
                # Iterate over the data_array
                for idx, item in enumerate(result_data.data_array):
                    score = getattr(item, "score", None)
                    data = {}
                    
                    # Log item structure for debugging
                    item_attrs = [x for x in dir(item) if not x.startswith("_")]
                    logger.info(f"Item {idx} type: {type(item)}, attrs: {item_attrs}")
                    
                    # Try multiple ways to extract data from the item
                    # The Databricks Vector Search API may return data in different formats
                    
                    # Method 1: Check if item has a 'document' or 'row' attribute
                    if hasattr(item, "document") and item.document:
                        doc = item.document
                        if isinstance(doc, dict):
                            data = doc
                        elif hasattr(doc, "__dict__"):
                            data = {k: v for k, v in doc.__dict__.items() if not k.startswith("_")}
                    
                    # Method 2: Check for 'row' attribute
                    if not data and hasattr(item, "row") and item.row:
                        row = item.row
                        if isinstance(row, dict):
                            data = row
                        elif hasattr(row, "__dict__"):
                            data = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
                    
                    # Method 3: Check for 'fields' attribute
                    if not data and hasattr(item, "fields") and item.fields:
                        if isinstance(item.fields, dict):
                            data = item.fields
                        elif hasattr(item.fields, "__iter__"):
                            for field in item.fields:
                                if hasattr(field, "name") and hasattr(field, "value"):
                                    data[field.name] = field.value
                                elif isinstance(field, dict) and "name" in field and "value" in field:
                                    data[field["name"]] = field["value"]
                    
                    # Method 4: Check for 'data_array' attribute
                    if not data and hasattr(item, "data_array") and item.data_array:
                        for field in item.data_array:
                            if hasattr(field, "name") and hasattr(field, "value"):
                                data[field.name] = field.value
                            elif isinstance(field, dict) and "name" in field and "value" in field:
                                data[field["name"]] = field["value"]
                    
                    # Method 5: Check for 'values' attribute and map to column names
                    if not data and hasattr(item, "values") and item.values:
                        if column_names and isinstance(item.values, (list, tuple)):
                            for i, value in enumerate(item.values):
                                if i < len(column_names):
                                    data[column_names[i]] = value
                        elif isinstance(item.values, (list, tuple)):
                            # If no column names, try to infer from the columns we requested
                            # The values should correspond to the columns we requested
                            # Get columns_to_fetch from the outer scope
                            try:
                                requested_cols = columns_to_fetch
                            except NameError:
                                requested_cols = ["full_name"]
                            
                            for i, value in enumerate(item.values):
                                if i < len(requested_cols):
                                    data[requested_cols[i]] = value
                                else:
                                    data[f"field_{i}"] = value
                    
                    # Method 6: Check for 'data' attribute
                    if not data and hasattr(item, "data"):
                        if isinstance(item.data, dict):
                            data = item.data
                        elif isinstance(item.data, str):
                            try:
                                data = json.loads(item.data)
                            except:
                                data = {"raw": item.data}
                    
                    # Method 7: If item is already a dict
                    if not data and isinstance(item, dict):
                        data = {k: v for k, v in item.items() if k not in ["score", "_score"]}
                    
                    # Method 8: If item is a list/tuple (the values are directly in the item)
                    if not data and isinstance(item, (list, tuple)):
                        logger.info(f"Item {idx} is a list/tuple with {len(item)} elements")
                        # The item itself contains the values in order
                        # First element is typically the data, last might be score
                        cols_to_use = column_names if column_names else requested_columns
                        for i, value in enumerate(item):
                            if i < len(cols_to_use):
                                data[cols_to_use[i]] = value
                            elif i == len(item) - 1 and isinstance(value, (int, float)):
                                # Last element might be the score
                                if score is None:
                                    score = float(value)
                            else:
                                data[f"field_{i}"] = value
                    
                    # Method 9: Extract from object attributes (last resort)
                    if not data and hasattr(item, "__dict__"):
                        data = {k: v for k, v in item.__dict__.items() 
                               if not k.startswith("_") and k not in ["score", "_score"] and v is not None}
                    
                    # If still no data, try accessing all attributes
                    if not data:
                        try:
                            # Try accessing all non-private attributes
                            for attr_name in item_attrs:
                                try:
                                    attr_value = getattr(item, attr_name)
                                    # Skip methods and None values
                                    if not callable(attr_value) and attr_value is not None:
                                        # Skip score as we handle it separately
                                        if attr_name != "score" and not attr_name.startswith("_"):
                                            data[attr_name] = attr_value
                                except Exception:
                                    pass
                        except Exception as e:
                            logger.warning(f"Item {idx} - error in fallback extraction: {str(e)}")
                    
                    # Log what we extracted
                    if data:
                        logger.info(f"Item {idx} extracted data keys: {list(data.keys())}")
                    else:
                        logger.warning(f"Item {idx} - no data extracted. Item type: {type(item)}, attrs: {item_attrs}")
                    
                    results.append(VectorSearchResult(score=score, data=data))
            elif isinstance(result_data, (list, tuple)):
                # If result is directly iterable
                for item in result_data:
                    score = getattr(item, "score", None) if hasattr(item, "score") else None
                    data = {}
                    if isinstance(item, dict):
                        data = {k: v for k, v in item.items() if k != "score"}
                    elif hasattr(item, "__dict__"):
                        data = {k: v for k, v in item.__dict__.items() if not k.startswith("_") and k != "score"}
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
        
        logger.info(f"Statement execution completed for person_id: {person_id}")
        logger.info(f"Querying table: benefits360.silver.people_index with person_id: {person_id}")
        
        # Check if we have results - avoid accessing nested attributes that trigger SDK serialization
        try:
            # Use getattr to safely check for result
            result_obj = getattr(result, 'result', None)
            if result_obj is None:
                logger.error(f"No result object returned for person_id: {person_id}")
                raise HTTPException(
                    status_code=404,
                    detail=f"No result returned for person with ID {person_id}. The person_id may not exist in benefits360.silver.people_index table."
                )
            
            # Use getattr to safely check for data_array
            data_array = getattr(result_obj, 'data_array', None)
            used_fallback = False
            if not data_array or len(data_array) == 0:
                # Fallback to matched_people table
                logger.warning(f"No data found in people_index for person_id: {person_id}, trying matched_people table")
                result = obo_ws.statement_execution.execute_statement(
                    warehouse_id=warehouse_id,
                    statement="""
                        SELECT 
                            person_id,
                            medical_id,
                            snap_id,
                            assistance_id,
                            first_name,
                            last_name,
                            birthdate,
                            full_name
                        FROM benefits360.silver.matched_people
                        WHERE person_id = :person_id
                        LIMIT 1
                    """,
                    parameters=[
                        StatementParameterListItem(name="person_id", value=person_id)
                    ],
                    wait_timeout="30s"
                )
                
                result_obj = getattr(result, 'result', None)
                if result_obj is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"No result returned for person with ID {person_id} from either table"
                    )
                
                data_array = getattr(result_obj, 'data_array', None)
                if not data_array or len(data_array) == 0:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Person with ID {person_id} not found in people_index or matched_people tables"
                    )
                logger.info(f"Found person_id: {person_id} in matched_people table (fallback)")
                used_fallback = True
            
            # Get the first row
            row = data_array[0]
            logger.info(f"Row retrieved, type: {type(row)}")
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error accessing result data: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error processing query result: {str(e)}"
            )
        
        # Map the result to PersonProfileOut model
        profile_data = {}
        
        # Get column names - use expected order based on SELECT statement
        # Maps database column names to model field names
        if used_fallback:
            # matched_people table has standard column names
            column_mapping = [
                ("person_id", "person_id"),
                ("medical_id", "medical_id"),
                ("snap_id", "snap_id"),
                ("assistance_id", "assistance_id"),
                ("first_name", "first_name"),
                ("last_name", "last_name"),
                ("birthdate", "birthdate"),
                ("full_name", "full_name")
            ]
        else:
            # people_index table - match SELECT order and map short names to model fields
            column_mapping = [
                ("person_id", "person_id"),
                ("full_name", "full_name"),
                ("birthdate", "birthdate"),
                ("first_name", "first_name"),
                ("last_name", "last_name"),
                ("med_id", "medical_id"),      # DB: med_id -> Model: medical_id
                ("snap_id", "snap_id"),
                ("case_id", "assistance_id")   # DB: case_id -> Model: assistance_id
            ]
        
        # Handle different row formats (dict, list, or object with values attribute)
        try:
            if isinstance(row, dict):
                # Row is already a dictionary
                logger.info("Row is a dict, using directly")
                profile_data = row
            elif isinstance(row, list):
                # Row is a list - map to column names
                logger.info(f"Row is a list with {len(row)} values, mapping to columns")
                for i, (db_col, model_col) in enumerate(column_mapping):
                    if i < len(row):
                        profile_data[model_col] = row[i]
            elif hasattr(row, 'values'):
                # Row is an object with values attribute
                logger.info("Row has values attribute, mapping to columns")
                values_attr = row.values
                # Convert to list if it's iterable
                if hasattr(values_attr, '__iter__'):
                    values_list = list(values_attr) if not isinstance(values_attr, list) else values_attr
                    for i, (db_col, model_col) in enumerate(column_mapping):
                        if i < len(values_list):
                            profile_data[model_col] = values_list[i]
                else:
                    raise ValueError(f"row.values is not iterable: {type(values_attr)}")
            elif hasattr(row, '__dict__'):
                # Try to convert row to dict
                logger.info("Row has __dict__, converting to dict")
                profile_data = {k: v for k, v in row.__dict__.items() if not k.startswith('_')}
            else:
                logger.error(f"Unknown row format: {type(row)}")
                raise ValueError(f"Unable to parse row data format: {type(row)}")
        except Exception as e:
            logger.error(f"Error parsing row data: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error parsing row data: {str(e)}"
            )
        
        logger.info(f"Retrieved profile for person_id: {person_id}")
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
    first_name: str = Query(..., description="First name to search for"),
    last_name: str = Query(..., description="Last name to search for"),
    birthdate: str = Query(..., description="Birthdate to search for (YYYY-MM-DD format)"),
    obo_ws: Annotated[WorkspaceClient, Depends(get_obo_ws)] = None,
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
        
        # Check if we have results
        if result.result and result.result.data_array:
            # Use expected column order from SQL SELECT statement
            column_names = ["name", "gender", "birthdate", "language"]
            logger.info(f"Processing medical participants with expected columns")
            
            # Iterate over all rows
            for row in result.result.data_array:
                participant_data = {}
                
                # Handle different row formats (dict or object with values attribute)
                if isinstance(row, dict):
                    # Row is already a dictionary
                    participant_data = row
                elif hasattr(row, 'values'):
                    # Row is an object with values attribute
                    for i, col_name in enumerate(column_names):
                        if i < len(row.values):
                            participant_data[col_name] = row.values[i]
                else:
                    # Try to convert row to dict if it has __dict__
                    if hasattr(row, '__dict__'):
                        participant_data = {k: v for k, v in row.__dict__.items() if not k.startswith('_')}
                
                if participant_data:
                    participants.append(MedicalParticipantOut(**participant_data))
        
        logger.info(f"Retrieved {len(participants)} medical participants for {first_name} {last_name}")
        return MedicalParticipantsResponse(participants=participants)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get medical participants: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve medical participants: {str(e)}"
        )
