import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { QueryErrorResetBoundary, useMutation } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { useCurrentUserSuspense } from "@/lib/api";
import selector from "@/lib/selector";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  User,
  Mail,
  Shield,
  Users,
  AlertCircle,
  CheckCircle,
  XCircle,
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

function ProfileContent() {
  const { data: user } = useCurrentUserSuspense(selector());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PersonProfile | null>(null);

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          endpoint_name: "lewis",
          index_name: "benefits360.silver.matched_people_vec",
          limit: 10,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(errorData.detail || `Search failed with status ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSearchResults(data.results || []);
      setSelectedProfile(null); // Clear selected profile when new search is performed
    },
    onError: (error) => {
      console.error("Search error:", error);
      setSearchResults([]);
      setSelectedProfile(null);
    },
  });

  // Profile load mutation
  const profileMutation = useMutation({
    mutationFn: async (personId: string) => {
      console.log("Mutation function called with personId:", personId);
      const response = await fetch(`/api/profile/${personId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      console.log("Profile fetch response status:", response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
        console.error("Profile fetch failed:", errorData);
        throw new Error(errorData.detail || `Failed to load profile with status ${response.status}`);
      }
      const data = await response.json();
      console.log("Profile data received:", data);
      return data;
    },
    onSuccess: (data) => {
      console.log("Profile loaded successfully:", data);
      setSelectedProfile(data);
    },
    onError: (error) => {
      console.error("Profile load error:", error);
      setSelectedProfile(null);
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

  const getInitials = () => {
    if (user.name?.given_name && user.name?.family_name) {
      return `${user.name.given_name[0]}${user.name.family_name[0]}`.toUpperCase();
    }
    if (user.display_name) {
      const parts = user.display_name.split(" ");
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return user.display_name.substring(0, 2).toUpperCase();
    }
    if (user.user_name) {
      return user.user_name.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  return (
    <div className="space-y-6">
      {/* Search Box */}
      <Card className="border-primary/20">
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

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">
                Results ({searchResults.length})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchResults.map((result, index) => {
                  const personId = result.data.person_id;
                  const isClickable = !!personId;
                  
                  // Debug logging
                  if (index === 0) {
                    console.log("First search result data:", result.data);
                    console.log("Person ID:", personId);
                  }
                  
                  return (
                    <Card 
                      key={index} 
                      className={`border-primary/10 ${isClickable ? "cursor-pointer hover:border-primary/30 transition-colors" : ""}`}
                      onClick={() => {
                        console.log("Card clicked, person_id:", personId);
                        if (personId) {
                          console.log("Fetching profile for person_id:", personId);
                          profileMutation.mutate(personId);
                        } else {
                          console.warn("No person_id found in result data:", result.data);
                        }
                      }}
                    >
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          {result.data.full_name && (
                            <p className="font-semibold">
                              {result.data.full_name}
                            </p>
                          )}
                          {result.score !== null && result.score !== undefined && (
                            <p className="text-xs text-muted-foreground">
                              Score: {result.score.toFixed(4)}
                            </p>
                          )}
                          {Object.entries(result.data)
                            .filter(([key]) => key !== "full_name" && key !== "score")
                            .map(([key, value]) => (
                              <div key={key} className="text-sm">
                                <span className="font-medium">{key}:</span>{" "}
                                <span className="text-muted-foreground">
                                  {String(value)}
                                </span>
                              </div>
                            ))}
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
            </div>
          )}

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

            {profileMutation.isPending && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading profile...</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Header Card */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <Avatar className="h-24 w-24">
              <AvatarFallback className="text-2xl font-bold bg-primary/10">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center md:text-left space-y-2">
              <div className="flex items-center gap-3 justify-center md:justify-start">
                <h1 className="text-3xl font-bold">
                  {user.display_name || user.user_name || "User"}
                </h1>
                {user.active !== null && (
                  <Badge
                    variant={user.active ? "default" : "secondary"}
                    className="flex items-center gap-1"
                  >
                    {user.active ? (
                      <>
                        <CheckCircle className="h-3 w-3" />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" />
                        Inactive
                      </>
                    )}
                  </Badge>
                )}
              </div>
              {user.user_name && (
                <p className="text-muted-foreground">@{user.user_name}</p>
              )}
              {user.id && (
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {user.id}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Details Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Information */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>Basic user details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.name && (
              <>
                {user.name.given_name && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      First Name
                    </p>
                    <p className="text-lg">{user.name.given_name}</p>
                  </div>
                )}
                {user.name.family_name && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Last Name
                      </p>
                      <p className="text-lg">{user.name.family_name}</p>
                    </div>
                  </>
                )}
              </>
            )}
            {user.external_id && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    External ID
                  </p>
                  <p className="text-sm font-mono">{user.external_id}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Contact Information
            </CardTitle>
            <CardDescription>Email addresses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.emails && user.emails.length > 0 ? (
              user.emails.map((email, index) => (
                <div key={index}>
                  {index > 0 && <Separator className="mb-4" />}
                  <div className="flex items-center gap-2">
                    <p className="text-sm break-all">{email.value}</p>
                    {email.primary && (
                      <Badge variant="secondary" className="text-xs">
                        Primary
                      </Badge>
                    )}
                  </div>
                  {email.type && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Type: {email.type}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No email addresses available
              </p>
            )}
          </CardContent>
        </Card>

        {/* Roles */}
        {user.roles && user.roles.length > 0 && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Roles
              </CardTitle>
              <CardDescription>
                User roles and permissions ({user.roles.length})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {user.roles.map((role, index) => (
                  <Badge key={index} variant="outline">
                    {role.value}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Groups */}
        {user.groups && user.groups.length > 0 && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Groups
              </CardTitle>
              <CardDescription>
                User group memberships ({user.groups.length})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {user.groups.map((group, index) => (
                  <Badge key={index} variant="outline">
                    {group.display || group.value}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Entitlements */}
        {user.entitlements && user.entitlements.length > 0 && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Entitlements
              </CardTitle>
              <CardDescription>
                User entitlements ({user.entitlements.length})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {user.entitlements.map((entitlement, index) => (
                  <Badge key={index} variant="secondary">
                    {entitlement.value}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Card Skeleton */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="flex-1 space-y-2 text-center md:text-left">
              <Skeleton className="h-8 w-48 mx-auto md:mx-0" />
              <Skeleton className="h-4 w-32 mx-auto md:mx-0" />
              <Skeleton className="h-3 w-64 mx-auto md:mx-0" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards Skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-primary/20">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
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
