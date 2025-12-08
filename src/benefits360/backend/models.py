from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import date
from .. import __version__


class VersionOut(BaseModel):
    version: str

    @classmethod
    def from_metadata(cls):
        return cls(version=__version__)


class VectorSearchRequest(BaseModel):
    query: str
    endpoint_name: str = "lewis"
    index_name: str = "benefits360.silver.people_index_vec"
    limit: Optional[int] = 10


class VectorSearchResult(BaseModel):
    score: Optional[float] = None
    data: dict[str, Any]


class VectorSearchResponse(BaseModel):
    results: List[VectorSearchResult]
    query: str


class PersonProfileOut(BaseModel):
    person_id: Optional[str] = None
    medical_id: Optional[str] = None
    snap_id: Optional[str] = None
    assistance_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birthdate: Optional[date] = None
    full_name: Optional[str] = None


class MedicalParticipantOut(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    birthdate: Optional[date] = None
    language: Optional[str] = None


class MedicalParticipantsResponse(BaseModel):
    participants: List[MedicalParticipantOut]
