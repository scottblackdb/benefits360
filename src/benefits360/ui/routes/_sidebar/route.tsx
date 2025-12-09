import SidebarLayout from "@/components/apx/sidebar-layout";
import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { User, Receipt, Heart } from "lucide-react";
import { useState, useEffect } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_sidebar")({
  component: () => <Layout />,
});

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

  // Listen for storage changes (when snap_id or med_id is updated)
  useEffect(() => {
    const handleStorageChange = () => {
      setStoredSnapId(localStorage.getItem("currentSnapId"));
      setStoredMedId(localStorage.getItem("currentMedId"));
    };

    // Listen for custom events from profile page
    window.addEventListener("snapIdChanged", handleStorageChange);
    window.addEventListener("medIdChanged", handleStorageChange);
    
    // Also listen for storage events from other tabs
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("snapIdChanged", handleStorageChange);
      window.removeEventListener("medIdChanged", handleStorageChange);
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
    <SidebarLayout>
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
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarLayout>
  );
}
