import { useEffect, useMemo, useState } from "react";
import { api, formatDateOnly, formatMoney, type Ingredient, type StockMovement, type Supplier } from "../api";
import { STOCK_KIND_LABELS, type StockMovementKind } from "../../shared/procurement";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import { SearchBar } from "../components/SearchBar";
import { matchesQuery } from "../search";
import { INGREDIENT_UNITS, type IngredientUnit } from "../../shared/types";
import { useAuth } from "../components/AuthGate";
import { canDeleteCatalog, canEditPrices } from "../../shared/roles";

const blank = {
  name: "",
  unit: "g" as IngredientUnit,
  supplierId: "",
  unitPrice: "",
  stockQty: "0",
  minStock: "0",
};

export function IngredientsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [moveKind, setMoveKind] = useState<StockMovementKind>("entrada");
  const [moveQty, setMoveQty] = useState("");
  const [moveNote, setMoveNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [i, s] = await Promise.all([api.listIngredients(), api.listSuppliers()]);
      setRows(i);
      setSuppliers(s);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function reset() {
    setEditingId(null);
    setForm(blank);
    setMovements([]);
    setMoveQty("");
    setMoveNote("");
  }

  async function loadMovements(ingredientId: number) {
    try {
      setMovements(await api.listStockMovements(ingredientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la bodega");
    }
  }

  function startEdit(row: Ingredient) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      unit: row.unit,
      supplierId: row.supplierId != null ? String(row.supplierId) : "",
      unitPrice: row.unitPrice != null ? String(row.unitPrice) : "",
      stockQty: String(row.stockQty ?? 0),
      minStock: String(row.minStock ?? 0),
    });
    void loadMovements(row.id);
  }

  async function onMovement() {
    if (!editingId) return;
    if (!(Number(moveQty) > 0)) {
      setError("Indica una cantidad mayor que cero");
      return;
    }
    setSaving(true);
    try {
      await api.createStockMovement({
        ingredientId: editingId,
        kind: moveKind,
        qty: Number(moveQty),
        note: moveNote.trim() || null,
      });
      setMoveQty("");
      setMoveNote("");
      await Promise.all([load(), loadMovements(editingId)]);
      const fresh = (await api.listIngredients()).find((row) => row.id === editingId);
      if (fresh) setForm((prev) => ({ ...prev, stockQty: String(fresh.stockQty ?? 0) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el movimiento");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        unit: form.unit,
        supplierId: form.supplierId === "" ? null : Number(form.supplierId),
        unitPrice: form.unitPrice === "" ? null : Number(form.unitPrice),
        stockQty: form.stockQty === "" ? 0 : Number(form.stockQty),
        minStock: form.minStock === "" ? 0 : Number(form.minStock),
      };
      if (editingId) await api.updateIngredient(editingId, payload);
      else await api.createIngredient(payload);
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await api.deleteIngredient(deleteId);
      setDeleteId(null);
      if (editingId === deleteId) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
      setDeleteId(null);
    }
  }

  const visible = useMemo(
    () =>
      rows.filter((r) => matchesQuery(query, r.name, r.supplierName, r.unit)),
    [rows, query],
  );

  return (
    <div>
      <PageHeader
        title="Ingredientes"
        subtitle="Catálogo con unidad, precio y proveedor opcional."
      />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="split">
        <div>
        <form className="panel form-grid" onSubmit={onSubmit}>
          <h2>{editingId ? "Editar" : "Nuevo ingrediente"}</h2>
          <FormField label="Nombre *">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormField>
          <div className="grid-2">
            <FormField label="Unidad *">
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value as IngredientUnit })}
              >
                {INGREDIENT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Precio unitario">
              <input
                type="number"
                min={0}
                step="1"
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                disabled={!canEditPrices(user.role)}
              />
            </FormField>
          </div>
          <div className="grid-2">
          <FormField
            label="Stock en bodega"
            hint="Al guardar un número distinto queda un ajuste. Entradas, mermas y reservas se anotan abajo."
          >
            <input
              type="number"
              min={0}
              step="0.001"
              value={form.stockQty}
              onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
              disabled={!canEditPrices(user.role)}
            />
          </FormField>
          <FormField
            label="Mínimo"
            hint="El inicio avisa cuando el stock llega a este número."
          >
            <input
              type="number"
              min={0}
              step="0.001"
              value={form.minStock}
              onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              disabled={!canEditPrices(user.role)}
            />
          </FormField>
          </div>
          <FormField label="Proveedor">
            <select
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          {editingId ? (
            <p className="meta">
              {(rows.find((r) => r.id === editingId)?.priceHistory ?? []).length
                ? `Historial: ${(rows.find((r) => r.id === editingId)?.priceHistory ?? [])
                    .slice(-5)
                    .map((h) => `${formatMoney(h.unitPrice)} (${formatDateOnly(h.recordedAt)})`)
                    .join(" · ")}`
                : "Aún no hay historial de precios. Se guarda cada vez que cambias el precio."}
            </p>
          ) : null}
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={saving || !canEditPrices(user.role)}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            {editingId ? (
              <button type="button" className="btn ghost" onClick={reset}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
        {editingId ? (
          <section className="panel form-grid" style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 0 }}>Movimiento de bodega</h3>
              <div className="grid-2">
                <FormField label="Tipo">
                  <select
                    value={moveKind}
                    onChange={(e) => setMoveKind(e.target.value as StockMovementKind)}
                  >
                    <option value="entrada">Entrada</option>
                    <option value="merma">Merma</option>
                    <option value="reserva">Reserva</option>
                  </select>
                </FormField>
                <FormField label={`Cantidad (${form.unit})`}>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={moveQty}
                    onChange={(e) => setMoveQty(e.target.value)}
                    required
                  />
                </FormField>
              </div>
              <FormField label="Nota">
                <input value={moveNote} onChange={(e) => setMoveNote(e.target.value)} />
              </FormField>
              <button className="btn" type="button" disabled={saving} onClick={() => void onMovement()}>
                Registrar movimiento
              </button>
              {movements.length ? (
                <ul className="checklist">
                  {movements.slice(0, 8).map((movement) => (
                    <li key={movement.id}>
                      {movement.qty > 0 ? "+" : ""}
                      {movement.qty} {movement.unit} · {STOCK_KIND_LABELS[movement.kind]}
                      {movement.note ? ` · ${movement.note}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="meta">Todavía no hay movimientos de este ingrediente.</p>
              )}
          </section>
        ) : null}
        </div>

        <section className="panel">
          <h2>Catálogo</h2>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Buscar ingrediente o proveedor…"
          />
          {loading ? (
            <div className="loading">Cargando…</div>
          ) : visible.length === 0 ? (
            <EmptyState title="Sin ingredientes" description="Agrega harina, leche, frutas…" />
          ) : (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Unidad</th>
                    <th>Proveedor</th>
                    <th>Precio</th>
                    <th>Stock</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.unit}</td>
                      <td>{row.supplierName ?? "—"}</td>
                      <td>{formatMoney(row.unitPrice)}</td>
                      <td>
                        {row.stockQty ?? 0} {row.unit}
                        {(row.minStock ?? 0) > 0 && (row.stockQty ?? 0) <= (row.minStock ?? 0) ? (
                          <span className="badge tone-warn" style={{ marginLeft: 8 }}>
                            mínimo {row.minStock}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <div className="page-actions">
                          <button type="button" className="btn" onClick={() => startEdit(row)}>
                            Editar
                          </button>
                          {canDeleteCatalog(user.role) ? (
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => setDeleteId(row.id)}
                          >
                            Eliminar
                          </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar ingrediente"
        message="Si está en una receta, puede que no se pueda borrar."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
