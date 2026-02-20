"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  PenSquare,
  Search,
  MoreVertical,
  Trash2,
  Edit,
  Globe,
  GlobeLock,
  Plus,
  SortAsc,
  SortDesc,
  FileText,
  Coins,
  DollarSign,
  Store,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";
import { NoteScoreBadge } from "@/components/note/note-score-badge";
import type { Note, User } from "@/lib/types";

interface PurchasedNote extends Note {
  users: User;
  purchase_date: string;
  price_paid: number;
  payment_method: "points" | "dollars";
}

interface DashboardClientProps {
  initialNotes: (Note & { users: User })[];
  profile: User | null;
  pointsBalance: number;
  dollarBalance: number;
  purchasedNotes?: PurchasedNote[];
}

type SortKey = "updated_at" | "title" | "created_at";
type SortOrder = "asc" | "desc";
type FilterStatus = "all" | "published" | "draft";

const NOTES_PER_PAGE = 12;

type ActiveTab = "my-notes" | "purchased";

function inferFileType(note: Note): string {
  const mime = (note.original_file_type || "").toLowerCase();
  const fileName = (note.original_file_name || "").toLowerCase();

  if (mime.includes("pdf") || fileName.endsWith(".pdf")) return "PDF";
  if (mime.includes("word") || fileName.endsWith(".docx")) return "DOCX";
  if (mime.includes("markdown") || fileName.endsWith(".md")) return "MD";
  if (mime.includes("text") || fileName.endsWith(".txt")) return "TXT";
  if (fileName) return "FILE";
  return "NOTE";
}

function fileTypeBadgeClass(type: string): string {
  switch (type) {
    case "PDF":
      return "border-red-300/60 text-red-600 dark:border-red-400/40 dark:text-red-400";
    case "DOCX":
      return "border-blue-300/60 text-blue-600 dark:border-blue-400/40 dark:text-blue-400";
    default:
      return "";
  }
}

export function DashboardClient({
  initialNotes,
  profile,
  pointsBalance,
  dollarBalance,
  purchasedNotes = [],
}: DashboardClientProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [activeTab, setActiveTab] = useState<ActiveTab>("my-notes");
  const [page, setPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const filteredAndSortedNotes = useMemo(() => {
    let result = [...notes];

    // Filter by search
    if (searchQuery) {
      result = result.filter(
        (note) =>
          note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          note.raw_markdown?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by status
    if (filterStatus === "published") {
      result = result.filter((n) => n.is_published);
    } else if (filterStatus === "draft") {
      result = result.filter((n) => !n.is_published);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") {
        cmp = a.title.localeCompare(b.title);
      } else {
        cmp =
          new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime();
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [notes, searchQuery, sortKey, sortOrder, filterStatus]);

  const totalPages = Math.ceil(filteredAndSortedNotes.length / NOTES_PER_PAGE);
  const paginatedNotes = filteredAndSortedNotes.slice(
    (page - 1) * NOTES_PER_PAGE,
    page * NOTES_PER_PAGE
  );

  const handleDelete = async () => {
    if (!noteToDelete) return;

    const { error } = await (supabase as any)
      .from("notes")
      .delete()
      .eq("id", noteToDelete);

    if (error) {
      toast.error("Failed to delete note");
      return;
    }

    setNotes(notes.filter((n) => n.id !== noteToDelete));
    setDeleteDialogOpen(false);
    setNoteToDelete(null);
    toast.success("Note deleted");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            Welcome back, {profile?.username || "User"}
          </h1>
          <p className="text-muted-foreground">
            You have {notes.length} note{notes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/editor/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Note
          </Button>
        </Link>
      </div>

      {/* Wallet */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Coins className="h-4 w-4" /> Points
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{pointsBalance.toLocaleString()}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" /> Earnings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">${dollarBalance.toFixed(2)}</span>
          </CardContent>
        </Card>
        <Card className="flex items-center justify-center">
          <Link href="/store">
            <Button variant="outline" className="gap-2">
              <Store className="h-4 w-4" />
              Buy Points
            </Button>
          </Link>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "my-notes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => { setActiveTab("my-notes"); setPage(1); }}
        >
          My Notes ({notes.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "purchased"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => { setActiveTab("purchased"); setPage(1); }}
        >
          Purchased ({purchasedNotes.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={activeTab === "my-notes" ? "Search notes..." : "Search purchased notes..."}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === "my-notes" && (
            <>
              <Button
                variant={filterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterStatus("all");
                  setPage(1);
                }}
              >
                All
              </Button>
              <Button
                variant={filterStatus === "published" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterStatus("published");
                  setPage(1);
                }}
              >
                Published
              </Button>
              <Button
                variant={filterStatus === "draft" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterStatus("draft");
                  setPage(1);
                }}
              >
                Drafts
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setSortOrder(sortOrder === "asc" ? "desc" : "asc")
            }
          >
            {sortOrder === "asc" ? (
              <SortAsc className="h-4 w-4" />
            ) : (
              <SortDesc className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Notes Grid */}
      {activeTab === "my-notes" ? (
        <>
          {paginatedNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No notes found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery
              ? "Try a different search term"
              : "Create your first note to get started"}
          </p>
          {!searchQuery && (
            <Link href="/editor/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Note
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paginatedNotes.map((note, i) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">
                        {note.title}
                      </CardTitle>
                        <div className="mt-1 flex items-center gap-2">
                          <CardDescription>
                            {format(new Date(note.updated_at), "MMM d, yyyy")}
                          </CardDescription>
                          <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${fileTypeBadgeClass(inferFileType(note))}`}>
                              {inferFileType(note)}
                            </Badge>
                        </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity"
                          aria-label="Note actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/editor/${note.id}`)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setNoteToDelete(note.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {note.summary ||
                      note.raw_markdown?.substring(0, 150) ||
                      "No content yet..."}
                  </p>
                </CardContent>
                <CardFooter className="pt-0 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={note.is_published ? "default" : "secondary"}>
                      {note.is_published ? (
                        <Globe className="h-3 w-3 mr-1" />
                      ) : (
                        <GlobeLock className="h-3 w-3 mr-1" />
                      )}
                      {note.is_published ? "Published" : "Draft"}
                    </Badge>
                    {note.is_published && (
                      <NoteScoreBadge
                        noteId={note.id}
                        preloadedScore={note.validation_score}
                        preloadedReason={(note as any).validation_feedback ?? undefined}
                      />
                    )}
                  </div>
                  <Link href={`/editor/${note.id}`}>
                    <Button variant="ghost" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {activeTab === "my-notes" && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
        </>
      ) : null}

      {/* Purchased Notes */}
      {activeTab === "purchased" && (
        <>
          {(() => {
            const filtered = purchasedNotes.filter((n) =>
              !searchQuery || n.title.toLowerCase().includes(searchQuery.toLowerCase())
            );
            const totalPurchasedPages = Math.ceil(filtered.length / NOTES_PER_PAGE);
            const paginated = filtered.slice((page - 1) * NOTES_PER_PAGE, page * NOTES_PER_PAGE);

            if (filtered.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No purchased notes</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery ? "Try a different search term" : "Notes you buy will appear here"}
                  </p>
                  {!searchQuery && (
                    <Link href="/explore">
                      <Button className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Explore Notes
                      </Button>
                    </Link>
                  )}
                </div>
              );
            }

            return (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {paginated.map((note, i) => (
                    <motion.div
                      key={note.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Link href={`/note/${note.users?.username}/${note.slug}`}>
                        <Card className="group hover:shadow-md transition-shadow cursor-pointer">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-lg truncate">
                                  {note.title}
                                </CardTitle>
                                <div className="mt-1 flex items-center gap-2">
                                  <CardDescription>
                                    by {note.users?.username ?? "Unknown"}
                                  </CardDescription>
                                  <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${fileTypeBadgeClass(inferFileType(note))}`}>
                                      {inferFileType(note)}
                                    </Badge>
                                </div>
                              </div>
                              <Badge variant="outline" className="shrink-0 ml-2">
                                <ShoppingBag className="h-3 w-3 mr-1" />
                                Purchased
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pb-3">
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {note.summary || note.raw_markdown?.substring(0, 150) || "No content..."}
                            </p>
                          </CardContent>
                          <CardFooter className="pt-0 flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {note.payment_method === "points" ? "Paid with points" : `$${Number(note.price_paid).toFixed(2)}`}
                            </span>
                            <span>{format(new Date(note.purchase_date), "MMM d, yyyy")}</span>
                          </CardFooter>
                        </Card>
                      </Link>
                    </motion.div>
                  ))}
                </div>

                {totalPurchasedPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPurchasedPages}</span>
                    <Button variant="outline" size="sm" disabled={page === totalPurchasedPages} onClick={() => setPage(page + 1)}>Next</Button>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the note
              and all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
