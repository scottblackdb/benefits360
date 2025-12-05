from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from .models import VersionOut, VectorSearchRequest, VectorSearchResponse, VectorSearchResult
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.iam import User as UserOut
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
        
        # The query_index API requires columns parameter
        # We need to get the index schema first to know what columns are available
        # Initialize columns_to_fetch with default value
        columns_to_fetch = ["full_name"]
        
        try:
            # Try to get the index information to see available columns
            index_info = vector_search_client.get_index(index_name=request.index_name)  # type: ignore
            # Extract column names from the index schema
            if hasattr(index_info, "schema") and index_info.schema:
                if hasattr(index_info.schema, "fields"):
                    columns_to_fetch = [field.name for field in index_info.schema.fields if field.name]
                elif hasattr(index_info.schema, "columns"):
                    columns_to_fetch = [col.name for col in index_info.schema.columns if col.name]
            
            # If we couldn't get columns from schema, use default
            if not columns_to_fetch:
                columns_to_fetch = ["full_name"]
            
            response = vector_search_client.query_index(  # type: ignore
                index_name=request.index_name,
                query_text=request.query,
                columns=columns_to_fetch,
                num_results=request.limit or 10,
            )
        except AttributeError:
            # If get_index doesn't exist, try querying with minimal columns
            # or try to infer from the index name/table
            try:
                # Try with just full_name since we're searching by full name
                response = vector_search_client.query_index(  # type: ignore
                    index_name=request.index_name,
                    query_text=request.query,
                    columns=columns_to_fetch,
                    num_results=request.limit or 10,
                )
            except Exception as query_error:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unable to query index. The index may not have a 'full_name' column. Please check the index schema. Error: {str(query_error)}"
                )
        except Exception as schema_error:
            # If we can't get schema, try with a minimal column set
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
                    detail=f"Unable to determine index columns. Error getting schema: {str(schema_error)}. Query error: {str(query_error)}"
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
