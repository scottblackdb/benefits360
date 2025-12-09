import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { QueryErrorResetBoundary, useMutation } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  User,
  AlertCircle,
  Search,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_sidebar/profile")({
  component: () => <Profile />,
});

interface PersonProfile {
  person_id?: string;
  medical_id?: string;
  snap_id?: string;
  assistance_id?: string;
  first_name?: string;
  last_name?: string;
  birthdate?: string;
  full_name?: string;
}

interface MedicalParticipant {
  name?: string;
  gender?: string;
  birthdate?: string;
  language?: string;
}

interface SearchResult {
  data: {
    person_id?: string;
    full_name?: string;
    birthdate?: string;
  };
  score?: number;
}

interface TimelineEvent {
  a_application_date?: string;
  assistance_type?: string;
  a_application_status?: string;
  a_decision_date?: string;
  m_application_date?: string;
  m_application_state?: string;
  m_decision_date?: string;
  snap_application_date?: string;
  s_application_state?: string;
  snap_decision_date?: string;
}

function ProfileContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PersonProfile | null>(null);
  const [medicalParticipants, setMedicalParticipants] = useState<MedicalParticipant[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          endpoint_name: "lewis",
          index_name: "benefits360.silver.people_index_vec",
          limit: 10,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(errorData.detail || `Search failed`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSearchResults(data.results || []);
      setSelectedProfile(null);
      setMedicalParticipants([]);
      setTimelineEvents([]);
      setShowSearchResults(true);
      
      // Clear snap_id and med_id from localStorage when starting new search
      localStorage.removeItem("currentSnapId");
      localStorage.removeItem("currentMedId");
      window.dispatchEvent(new Event("snapIdChanged"));
      window.dispatchEvent(new Event("medIdChanged"));
    },
    onError: () => {
      setSearchResults([]);
      setSelectedProfile(null);
      setMedicalParticipants([]);
      setTimelineEvents([]);
    },
  });

  // Profile load mutation
  const profileMutation = useMutation({
    mutationFn: async (personId: string) => {
      const response = await fetch(`/api/profile/${personId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(errorData.detail || `Failed to load profile`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSelectedProfile(data);
      setShowSearchResults(false);
      
      // Store snap_id in localStorage for sidebar navigation
      if (data.snap_id) {
        localStorage.setItem("currentSnapId", data.snap_id);
      } else {
        localStorage.removeItem("currentSnapId");
      }
      
      // Store medical_id (case_id) in localStorage for sidebar navigation
      if (data.medical_id) {
        localStorage.setItem("currentMedId", data.medical_id);
      } else {
        localStorage.removeItem("currentMedId");
      }
      
      // Dispatch custom events to notify sidebar of changes
      window.dispatchEvent(new Event("snapIdChanged"));
      window.dispatchEvent(new Event("medIdChanged"));
      
      // Fetch medical participants if we have the required data
      if (data.first_name && data.last_name && data.birthdate) {
        medicalParticipantsMutation.mutate({
          first_name: data.first_name,
          last_name: data.last_name,
          birthdate: data.birthdate,
        });
      }
      
      // Fetch timeline data if we have person_id
      if (data.person_id) {
        timelineMutation.mutate(data.person_id);
      }
    },
    onError: () => {
      setSelectedProfile(null);
      setMedicalParticipants([]);
      setTimelineEvents([]);
    },
  });

  // Medical participants mutation
  const medicalParticipantsMutation = useMutation({
    mutationFn: async (params: { first_name: string; last_name: string; birthdate: string }) => {
      const queryParams = new URLSearchParams(params);
      const response = await fetch(`/api/medical-participants?${queryParams}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(errorData.detail || `Failed to load medical participants`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setMedicalParticipants(data.participants || []);
    },
    onError: () => {
      setMedicalParticipants([]);
    },
  });

  // Timeline mutation
  const timelineMutation = useMutation({
    mutationFn: async (personId: string) => {
      const response = await fetch(`/api/timeline/${personId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(errorData.detail || `Failed to load timeline`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setTimelineEvents(data.events || []);
    },
    onError: () => {
      setTimelineEvents([]);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Header - Always Visible */}
      <Card className="border-primary/20 sticky top-0 z-10 bg-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search People
          </CardTitle>
          <CardDescription>
            Search for people by full name using vector search
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter full name to search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={searchMutation.isPending || !searchQuery.trim()}
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>
          </form>

          {searchMutation.isError && (
            <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm font-medium text-destructive">Search failed</p>
              <p className="text-xs text-destructive/80 mt-1">
                {searchMutation.error instanceof Error
                  ? searchMutation.error.message
                  : "An error occurred while searching. Please try again."}
              </p>
            </div>
          )}

          {profileMutation.isError && (
            <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm font-medium text-destructive">Failed to load profile</p>
              <p className="text-xs text-destructive/80 mt-1">
                {profileMutation.error instanceof Error
                  ? profileMutation.error.message
                  : "An error occurred while loading the profile. Please try again."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results - Shown/Hidden based on state */}
      {showSearchResults && searchResults.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Search Results ({searchResults.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {searchResults.map((result, index) => {
                const personId = result.data.person_id;
                const isClickable = !!personId;
                
                return (
                  <Card 
                    key={index} 
                    className={`border-primary/10 ${isClickable ? "cursor-pointer hover:border-primary/30 transition-colors" : ""}`}
                    onClick={() => personId && profileMutation.mutate(personId)}
                  >
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        {result.data.full_name && (
                          <p className="font-semibold text-lg">
                            {result.data.full_name}
                          </p>
                        )}
                        {result.data.birthdate && (
                          <p className="text-sm text-muted-foreground">
                            Birth Date: {result.data.birthdate}
                          </p>
                        )}
                        {result.score !== null && result.score !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            Match Score: {result.score.toFixed(4)}
                          </p>
                        )}
                        {isClickable && (
                          <p className="text-xs text-primary mt-2">
                            Click to view full profile →
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Results Message */}
      {showSearchResults && searchResults.length === 0 && !searchMutation.isPending && (
        <Card className="border-primary/20">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-muted-foreground">No results found for "{searchQuery}"</p>
              <p className="text-sm text-muted-foreground mt-2">Try a different search term</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Medical Participants Loading */}
      {medicalParticipantsMutation.isPending && (
        <Card className="border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading medical participants...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Medical Participants Profile Overview */}
      {medicalParticipants.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Medical Profile Overview
            </CardTitle>
            <CardDescription>
              Medical participant information from benefits360.bronze.medical_participants
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {medicalParticipants.map((participant, index) => (
              <div key={index} className={`space-y-3 ${index > 0 ? "pt-4 border-t" : ""}`}>
                {participant.name && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Name</p>
                    <p className="text-lg font-semibold">{participant.name}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {participant.gender && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Gender</p>
                      <p className="text-base">{participant.gender}</p>
                    </div>
                  )}

                  {participant.birthdate && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Birth Date</p>
                      <p className="text-base">{participant.birthdate}</p>
                    </div>
                  )}

                  {participant.language && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Language</p>
                      <p className="text-base">{participant.language}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {medicalParticipantsMutation.isError && (
        <Card className="border-destructive/20">
          <CardContent className="pt-6">
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm font-medium text-destructive">Failed to load medical participants</p>
              <p className="text-xs text-destructive/80 mt-1">
                {medicalParticipantsMutation.error instanceof Error
                  ? medicalParticipantsMutation.error.message
                  : "An error occurred while loading medical participants."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile Loading */}
      {profileMutation.isPending && (
        <Card className="border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading profile...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Profile Display */}
      {selectedProfile && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Details
            </CardTitle>
            <CardDescription>
              Full profile information from the database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedProfile.full_name && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                <p className="text-lg font-semibold">{selectedProfile.full_name}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedProfile.first_name && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">First Name</p>
                  <p className="text-base">{selectedProfile.first_name}</p>
                </div>
              )}

              {selectedProfile.last_name && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Last Name</p>
                  <p className="text-base">{selectedProfile.last_name}</p>
                </div>
              )}

              {selectedProfile.birthdate && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Birth Date</p>
                  <p className="text-base">{selectedProfile.birthdate}</p>
                </div>
              )}

              {selectedProfile.person_id && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Person ID</p>
                  <p className="text-sm font-mono">{selectedProfile.person_id}</p>
                </div>
              )}

              {selectedProfile.medical_id && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Medical ID</p>
                  <p className="text-sm font-mono">{selectedProfile.medical_id}</p>
                </div>
              )}

              {selectedProfile.snap_id && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">SNAP ID</p>
                  <p className="text-sm font-mono">{selectedProfile.snap_id}</p>
                </div>
              )}

              {selectedProfile.assistance_id && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Assistance ID</p>
                  <p className="text-sm font-mono">{selectedProfile.assistance_id}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline Loading */}
      {timelineMutation.isPending && (
        <Card className="border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading timeline...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline Display */}
      {timelineEvents.length > 0 && (() => {
        // Parse and flatten all timeline events into individual chronological events
        const chronologicalEvents: Array<{
          date: Date;
          dateStr: string;
          program: string;
          eventType: string;
          details: Record<string, string>;
          color: string;
        }> = [];

        timelineEvents.forEach((event) => {
          // Assistance Application
          if (event.a_application_date) {
            chronologicalEvents.push({
              date: new Date(event.a_application_date),
              dateStr: event.a_application_date,
              program: "Assistance",
              eventType: "Application Submitted",
              details: {
                ...(event.assistance_type && { "Assistance Type": event.assistance_type }),
                ...(event.a_application_status && { "Status": event.a_application_status }),
              },
              color: "bg-blue-500",
            });
          }
          
          // Assistance Decision
          if (event.a_decision_date) {
            chronologicalEvents.push({
              date: new Date(event.a_decision_date),
              dateStr: event.a_decision_date,
              program: "Assistance",
              eventType: "Decision Made",
              details: {
                ...(event.assistance_type && { "Assistance Type": event.assistance_type }),
                ...(event.a_application_status && { "Status": event.a_application_status }),
              },
              color: "bg-blue-500",
            });
          }

          // Medical Application
          if (event.m_application_date) {
            chronologicalEvents.push({
              date: new Date(event.m_application_date),
              dateStr: event.m_application_date,
              program: "Medical",
              eventType: "Application Submitted",
              details: {
                ...(event.m_application_state && { "Status": event.m_application_state }),
              },
              color: "bg-green-500",
            });
          }

          // Medical Decision
          if (event.m_decision_date) {
            chronologicalEvents.push({
              date: new Date(event.m_decision_date),
              dateStr: event.m_decision_date,
              program: "Medical",
              eventType: "Decision Made",
              details: {
                ...(event.m_application_state && { "Status": event.m_application_state }),
              },
              color: "bg-green-500",
            });
          }

          // SNAP Application
          if (event.snap_application_date) {
            chronologicalEvents.push({
              date: new Date(event.snap_application_date),
              dateStr: event.snap_application_date,
              program: "SNAP",
              eventType: "Application Submitted",
              details: {
                ...(event.s_application_state && { "Status": event.s_application_state }),
              },
              color: "bg-orange-500",
            });
          }

          // SNAP Decision
          if (event.snap_decision_date) {
            chronologicalEvents.push({
              date: new Date(event.snap_decision_date),
              dateStr: event.snap_decision_date,
              program: "SNAP",
              eventType: "Decision Made",
              details: {
                ...(event.s_application_state && { "Status": event.s_application_state }),
              },
              color: "bg-orange-500",
            });
          }
        });

        // Sort events chronologically (oldest to newest)
        chronologicalEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

        return (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Timeline
              </CardTitle>
              <CardDescription>
                Application and decision history across all programs in chronological order
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-border" />
                
                {/* Timeline events */}
                <div className="space-y-6">
                  {chronologicalEvents.map((event, index) => (
                    <div key={index} className="relative pl-8">
                      {/* Dot marker */}
                      <div className={`absolute left-0 top-1 w-4 h-4 rounded-full ${event.color} border-4 border-background`} />
                      
                      {/* Event content */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{event.dateStr}</span>
                          <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                            {event.program}
                          </span>
                        </div>
                        <p className="text-base font-medium">{event.eventType}</p>
                        
                        {/* Event details */}
                        {Object.keys(event.details).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {Object.entries(event.details).map(([key, value]) => (
                              <div key={key} className="text-sm">
                                <span className="text-muted-foreground">{key}:</span>{" "}
                                <span>{value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Timeline Error */}
      {timelineMutation.isError && (
        <Card className="border-destructive/20">
          <CardContent className="pt-6">
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm font-medium text-destructive">Failed to load timeline</p>
              <p className="text-xs text-destructive/80 mt-1">
                {timelineMutation.error instanceof Error
                  ? timelineMutation.error.message
                  : "An error occurred while loading timeline data."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Simple skeleton - profile search is handled above */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Profile() {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ resetErrorBoundary }) => (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  Failed to Load Profile
                </CardTitle>
                <CardDescription>
                  There was an error loading your profile information. Make sure
                  the backend is running and you're authenticated.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button variant="outline" onClick={resetErrorBoundary}>
                  Try Again
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/">Go Home</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        >
          <Suspense fallback={<ProfileSkeleton />}>
            <ProfileContent />
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
