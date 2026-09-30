"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { Product } from "@/lib/api";
import { deleteProductAction } from "@/lib/actions/products";
import { EMLY_PRODUCT } from "@/lib/product-rules";
import { formatDate } from "@/lib/format-date";
import { ProductFormDialog } from "@/components/product-form-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function CreateProductButton() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("products");

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        {t("create")}
      </Button>
      {/* Mounted only while open so every opening starts from a blank form. */}
      {open && <ProductFormDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

export function ProductsTable({ products, isAdmin }: { products: Product[]; isAdmin: boolean }) {
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("products");

  function confirmDelete() {
    if (!deleteTarget) return;
    const slug = deleteTarget.slug;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteProductAction(slug);
      if (result.error) toast.error(t("table.deleteFailed", { error: result.error }));
      else toast.success(t("table.deleted", { slug }));
    });
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.slug")}</TableHead>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.s3Prefix")}</TableHead>
              <TableHead>{t("table.created")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {t("table.noData")}
                </TableCell>
              </TableRow>
            )}
            {products.map((product) => (
              <TableRow key={product.slug}>
                <TableCell className="font-mono font-medium">{product.slug}</TableCell>
                <TableCell>{product.name}</TableCell>
                <TableCell>
                  <Badge variant={product.enabled ? "outline" : "secondary"}>
                    {product.enabled ? t("table.enabled") : t("table.disabled")}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {product.s3_prefix || t("table.defaultPrefix")}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(product.created_at)}
                </TableCell>
                <TableCell>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={isPending}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(product)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("table.edit")}
                        </DropdownMenuItem>
                        {/* EMLy is the one product the API never deletes (409). */}
                        {product.slug !== EMLY_PRODUCT && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteTarget(product)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("table.delete")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editTarget && (
        <ProductFormDialog
          key={editTarget.slug}
          product={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("table.deleteTitle", { slug: deleteTarget?.slug ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("table.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("table.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {t("table.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
