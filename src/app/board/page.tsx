"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

// --- Types ---
export type IssueStatus = "backlog" | "todo" | "in_progress" | "done" | "cancelled";
export type IssuePriority = "urgent" | "high" | "medium" | "low";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee_id: string | null;
  assignee?: Profile | null;
}

// UI Configuration
const STATUS_COLUMNS: { id: IssueStatus; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

const PRIORITY_COLORS: Record<IssuePriority, string> = {
  urgent: "bg-red-500 text-white hover:bg-red-600",
  high: "bg-orange-500 text-white hover:bg-orange-600",
  medium: "bg-yellow-500 text-white hover:bg-yellow-600",
  low: "bg-blue-500 text-white hover:bg-blue-600",
};

export default function KanbanBoardPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    let mounted = true;

    async function fetchIssues() {
      try {
        setLoading(true);
        // We fetch issues along with the assignee profile
        const { data, error: fetchError } = await supabase
          .from("issues")
          .select(`
            id, 
            title, 
            status, 
            priority, 
            assignee_id,
            assignee:profiles(id, full_name, avatar_url)
          `)
          .in("status", ["backlog", "todo", "in_progress", "done"]);

        if (fetchError) {
          console.error("Error fetching issues:", fetchError);
          if (mounted) setError("An unexpected error occurred. Please try again later.");
          return;
        }

        // We map the assignee data because Supabase joins can return arrays or single objects depending on relationship.
        // Profiles is a one-to-one (many-to-one) so it should be a single object.
        const formattedIssues: Issue[] = (data || []).map((issue: any) => ({
          ...issue,
          assignee: Array.isArray(issue.assignee) ? issue.assignee[0] : issue.assignee,
        }));

        if (mounted) {
          setIssues(formattedIssues);
          setError(null);
        }
      } catch (err) {
        console.error("Unexpected runtime error:", err);
        if (mounted) setError("An unexpected error occurred. Please try again later.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchIssues();

    // Subscribe to realtime updates for issues
    const channel = supabase
      .channel("issues_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "issues" },
        (payload) => {
          // When an issue changes, re-fetch all to ensure assignee relations are intact
          // Alternatively, we could patch the state manually if it's just a status change
          // But refetching is safer to maintain data consistency.
          fetchIssues();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-red-500 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-slate-900 dark:text-slate-100">Board</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage your project issues</p>
      </div>

      <div className="flex flex-1 gap-6 overflow-x-auto pb-4">
        {STATUS_COLUMNS.map((column) => (
          <div key={column.id} className="flex flex-col w-80 shrink-0 bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300">
                {column.label}
              </h3>
              <Badge variant="secondary" className="font-mono">
                {loading ? "-" : issues.filter((i) => i.status === column.id).length}
              </Badge>
            </div>

            <ScrollArea className="flex-1 pr-4 -mr-4">
              <div className="flex flex-col gap-3 pb-4">
                {loading ? (
                  <>
                    <Skeleton className="h-32 w-full rounded-lg" />
                    <Skeleton className="h-32 w-full rounded-lg" />
                  </>
                ) : (
                  <ColumnContent
                    issues={issues.filter((i) => i.status === column.id)}
                  />
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColumnContent({ issues }: { issues: Issue[] }) {
  if (!issues || issues.length === 0) {
    return (
      <div className="h-24 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">No issues</p>
      </div>
    );
  }

  return issues.map((issue) => (
    <Card key={issue.id} className="cursor-grab hover:shadow-md transition-shadow">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium leading-tight">
          {issue?.title || "Untitled Issue"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="flex items-center justify-between mt-4">
          <Badge className={`text-xs capitalize ${PRIORITY_COLORS[issue.priority] || PRIORITY_COLORS.medium}`}>
            {issue?.priority || "medium"}
          </Badge>
          
          <Avatar className="h-6 w-6">
            <AvatarImage
              src={issue?.assignee?.avatar_url || ""}
              alt={issue?.assignee?.full_name || "Unassigned"}
            />
            <AvatarFallback className="text-[10px]">
              {issue?.assignee?.full_name?.charAt(0)?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
        </div>
      </CardContent>
    </Card>
  ));
}
