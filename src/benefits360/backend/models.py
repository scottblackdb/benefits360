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
    birthdate: Optional[str] = None
    language: Optional[str] = None


class MedicalParticipantsResponse(BaseModel):
    participants: List[MedicalParticipantOut]


class TimelineEventOut(BaseModel):
    # Assistance fields
    a_application_date: Optional[str] = None
    assistance_type: Optional[str] = None
    a_application_status: Optional[str] = None
    a_decision_date: Optional[str] = None
    # Medical fields
    m_application_date: Optional[str] = None
    m_application_state: Optional[str] = None
    m_decision_date: Optional[str] = None
    # SNAP fields
    snap_application_date: Optional[str] = None
    s_application_state: Optional[str] = None
    snap_decision_date: Optional[str] = None


class TimelineResponse(BaseModel):
    events: List[TimelineEventOut]


class SnapParticipantDetailOut(BaseModel):
    snap_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birthdate: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    race: Optional[str] = None
    ethnicity: Optional[str] = None
    is_disabled: Optional[bool] = None
    language: Optional[str] = None
    household_size: Optional[int] = None
    household_type: Optional[str] = None
    monthly_income: Optional[float] = None
    income_source: Optional[str] = None
    estimated_assets: Optional[float] = None
    income_limit: Optional[float] = None
    asset_limit: Optional[float] = None
    income_eligible: Optional[bool] = None
    asset_eligible: Optional[bool] = None
    work_requirement_exempt: Optional[bool] = None
    overall_eligible: Optional[bool] = None
    max_benefit: Optional[float] = None
    monthly_snap_benefit: Optional[float] = None
    annual_snap_benefit: Optional[float] = None
    snap_application_date: Optional[str] = None
    snap_decision_date: Optional[str] = None
    application_status: Optional[str] = None


class MedicalParticipantDetailOut(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    case_id: Optional[str] = None
    birthdate: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    race: Optional[str] = None
    ethnicity: Optional[str] = None
    is_disabled: Optional[bool] = None
    language: Optional[str] = None
    household_size: Optional[int] = None
    household_type: Optional[str] = None
    monthly_income: Optional[float] = None
    annual_income: Optional[float] = None
    income_source: Optional[str] = None
    employment_status: Optional[str] = None
    estimated_assets: Optional[float] = None
    fpl_percentage: Optional[float] = None
    income_eligible: Optional[bool] = None
    asset_eligible: Optional[bool] = None
    citizenship_status: Optional[str] = None
    residency_eligible: Optional[bool] = None
    overall_eligible: Optional[bool] = None
    coverage_category: Optional[str] = None
    premium_amount: Optional[float] = None
    copay_amount: Optional[float] = None
    application_date: Optional[str] = None
    decision_date: Optional[str] = None
    application_status: Optional[str] = None
    enrollment_date: Optional[str] = None
    county: Optional[str] = None
