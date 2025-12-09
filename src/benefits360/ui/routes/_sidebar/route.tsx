import SidebarLayout from "@/components/apx/sidebar-layout";
import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { User, Receipt, Heart, HandHeart, Search, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchProvider, useSearch } from "@/contexts/SearchContext";

export const Route = createFileRoute("/_sidebar")({
  component: () => (
    <SearchProvider>
      <Layout />
    </SearchProvider>
  ),
});

function SearchHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { searchQuery, setSearchQuery, setSearchResults, setShowSearchResults } = useSearch();

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
      setShowSearchResults(true);
      
      // Navigate to profile page if not already there
      if (location.pathname !== "/profile") {
        navigate({ to: "/profile" });
      }
      
      // Clear stored IDs when starting new search
      localStorage.removeItem("currentPersonId");
      localStorage.removeItem("currentSnapId");
      localStorage.removeItem("currentMedId");
      localStorage.removeItem("currentAssistanceId");
      window.dispatchEvent(new Event("snapIdChanged"));
      window.dispatchEvent(new Event("medIdChanged"));
      window.dispatchEvent(new Event("assistanceIdChanged"));
    },
    onError: () => {
      setSearchResults([]);
      setShowSearchResults(false);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery.trim());
    }
  };

  return (
    <div className="border-b bg-background px-4 py-3">
      <form onSubmit={handleSearch} className="flex gap-2 max-w-2xl">
        <Input
          type="text"
          placeholder="Search for people by full name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={searchMutation.isPending || !searchQuery.trim()}
          size="default"
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
      </form>
    </div>
  );
}

function Layout() {
  const location = useLocation();

  // Get the stored snap_id from localStorage with reactive updates
  const [storedSnapId, setStoredSnapId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("currentSnapId") : null
  );

  // Get the stored med_id (case_id) from localStorage with reactive updates
  const [storedMedId, setStoredMedId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("currentMedId") : null
  );

  // Get the stored assistance_id (case_id) from localStorage with reactive updates
  const [storedAssistanceId, setStoredAssistanceId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("currentAssistanceId") : null
  );

  // Listen for storage changes (when snap_id, med_id, or assistance_id is updated)
  useEffect(() => {
    const handleStorageChange = () => {
      setStoredSnapId(localStorage.getItem("currentSnapId"));
      setStoredMedId(localStorage.getItem("currentMedId"));
      setStoredAssistanceId(localStorage.getItem("currentAssistanceId"));
    };

    // Listen for custom events from profile page
    window.addEventListener("snapIdChanged", handleStorageChange);
    window.addEventListener("medIdChanged", handleStorageChange);
    window.addEventListener("assistanceIdChanged", handleStorageChange);
    
    // Also listen for storage events from other tabs
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("snapIdChanged", handleStorageChange);
      window.removeEventListener("medIdChanged", handleStorageChange);
      window.removeEventListener("assistanceIdChanged", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const navItems = [
    {
      to: "/profile",
      label: "Profile",
      icon: <User size={16} />,
      match: (path: string) => path === "/profile",
    },
  ];

  return (
    <SidebarLayout searchHeader={<SearchHeader />}>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg",
                    item.match(location.pathname)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuItem>
            ))}
            
            {/* Medical Details Link - Only show if we have a med_id */}
            {storedMedId && (
              <SidebarMenuItem>
                <Link
                  to="/medical-details/$caseId"
                  params={{ caseId: storedMedId }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg",
                    location.pathname.startsWith("/medical-details")
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Heart size={16} />
                  <span>Medical Details</span>
                </Link>
              </SidebarMenuItem>
            )}
            
            {/* SNAP Details Link - Only show if we have a snap_id */}
            {storedSnapId && (
              <SidebarMenuItem>
                <Link
                  to="/snap-details/$snapId"
                  params={{ snapId: storedSnapId }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg",
                    location.pathname.startsWith("/snap-details")
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Receipt size={16} />
                  <span>SNAP Details</span>
                </Link>
              </SidebarMenuItem>
            )}
            
            {/* Assistance Details Link - Only show if we have an assistance_id */}
            {storedAssistanceId && (
              <SidebarMenuItem>
                <Link
                  to="/assistance-details/$caseId"
                  params={{ caseId: storedAssistanceId }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg",
                    location.pathname.startsWith("/assistance-details")
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <HandHeart size={16} />
                  <span>Assistance Details</span>
                </Link>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarLayout>
  );
}
