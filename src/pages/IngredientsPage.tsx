import { useEffect, useMemo, useState } from "react";
import { api, formatMoney, type Ingredient, type Supplier } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import { SearchBar } from "../components/SearchBar";
import { matchesQuery } from "../search";
import { INGREDIENT_UNITS, type IngredientUnit } from "../../shared/types";

const blank = { name: "", unit: "g" as IngredientUnit, supplierId: "", unitPrice: "", stockQty: "0" };

export function IngredientsPage() {
  const [rows, setRows] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

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
  }

  function startEdit(row: Ingredient) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      unit: row.unit,
      supplierId: row.supplierId != null ? String(row.supplierId) : "",
      unitPrice: row.unitPrice != null ? String(row.unitPrice) : "",
      stockQty: String(row.stockQty ?? 0),
    });
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
              />
            </FormField>
          </div>
          <FormField
            label="Stock en bodega"
            hint="La lista de compras resta este stock de lo que hay que comprar."
          >
            <input
              type="number"
              min={0}
              step="0.001"
              value={form.stockQty}
              onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
            />
          </FormField>
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
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            {editingId ? (
              <button type="button" className="btn ghost" onClick={reset}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

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
                      </td>
                      <td>
                        <div className="page-actions">
                          <button type="button" className="btn" onClick={() => startEdit(row)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => setDeleteId(row.id)}
                          >
                            Eliminar
                          </button>
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
