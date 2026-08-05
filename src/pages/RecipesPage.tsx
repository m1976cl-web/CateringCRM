import { useEffect, useState } from "react";
import { api, type Ingredient, type Recipe } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";

type IngRow = { ingredientId: number; quantity: number };

const blank = {
  name: "",
  yieldPortions: 10,
  category: "",
  instructions: "",
  estimatedCost: "",
};

export function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [form, setForm] = useState(blank);
  const [ings, setIngs] = useState<IngRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [r, i] = await Promise.all([api.listRecipes(), api.listIngredients()]);
      setRecipes(r);
      setIngredients(i);
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
    setIngs([]);
  }

  function startEdit(r: Recipe) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      yieldPortions: r.yieldPortions,
      category: r.category ?? "",
      instructions: r.instructions ?? "",
      estimatedCost: r.estimatedCost != null ? String(r.estimatedCost) : "",
    });
    setIngs(r.ingredients.map((x) => ({ ingredientId: x.ingredientId, quantity: x.quantity })));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        yieldPortions: form.yieldPortions,
        category: form.category || null,
        instructions: form.instructions || null,
        estimatedCost: form.estimatedCost === "" ? null : Number(form.estimatedCost),
        ingredients: ings.filter((x) => x.ingredientId && x.quantity > 0),
      };
      if (editingId) await api.updateRecipe(editingId, payload);
      else await api.createRecipe(payload);
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
      await api.deleteRecipe(deleteId);
      setDeleteId(null);
      if (editingId === deleteId) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
      setDeleteId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Recetas"
        subtitle="Define el rendimiento y los ingredientes; las cantidades se escalan a cada evento."
      />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="split">
        <form className="panel form-grid" onSubmit={onSubmit}>
          <h2>{editingId ? "Editar receta" : "Nueva receta"}</h2>
          <FormField label="Nombre *">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormField>
          <div className="grid-2">
            <FormField label="Rinde (porciones) *" hint="Cantidad base de la receta">
              <input
                type="number"
                min={1}
                value={form.yieldPortions}
                onChange={(e) => setForm({ ...form, yieldPortions: Number(e.target.value) })}
                required
              />
            </FormField>
            <FormField label="Categoría">
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ej. Entrada, Principal"
              />
            </FormField>
          </div>
          <FormField label="Costo estimado">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.estimatedCost}
              onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
            />
          </FormField>
          <FormField label="Instrucciones">
            <textarea
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
          </FormField>

          <div>
            <div className="page-header" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Ingredientes</h3>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!ingredients.length) {
                    setError("Primero crea ingredientes en el catálogo");
                    return;
                  }
                  setIngs([
                    ...ings,
                    { ingredientId: ingredients[0].id, quantity: 1 },
                  ]);
                }}
              >
                Agregar
              </button>
            </div>
            {ings.map((row, idx) => (
              <div key={idx} className="inline-row" style={{ marginBottom: 8 }}>
                <FormField label="Ingrediente">
                  <select
                    value={row.ingredientId}
                    onChange={(e) => {
                      const next = [...ings];
                      next[idx] = { ...row, ingredientId: Number(e.target.value) };
                      setIngs(next);
                    }}
                  >
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit})
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Cantidad">
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={row.quantity}
                    onChange={(e) => {
                      const next = [...ings];
                      next[idx] = { ...row, quantity: Number(e.target.value) };
                      setIngs(next);
                    }}
                  />
                </FormField>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => setIngs(ings.filter((_, i) => i !== idx))}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className="form-actions">
            <button className="btn primary" disabled={saving} type="submit">
              {saving ? "Guardando…" : editingId ? "Guardar" : "Crear receta"}
            </button>
            {editingId ? (
              <button type="button" className="btn ghost" onClick={reset}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

        <section className="panel">
          <h2>Listado</h2>
          {loading ? (
            <div className="loading">Cargando…</div>
          ) : recipes.length === 0 ? (
            <EmptyState
              title="Sin recetas"
              description="Crea tu primera receta configurable."
            />
          ) : (
            <div className="list" style={{ marginTop: 12 }}>
              {recipes.map((r) => (
                <div key={r.id} className="list-item">
                  <div>
                    <h3>{r.name}</h3>
                    <div className="meta">
                      Rinde {r.yieldPortions} · {r.ingredients.length} ingredientes
                      {r.category ? ` · ${r.category}` : ""}
                    </div>
                  </div>
                  <div className="page-actions">
                    <button type="button" className="btn" onClick={() => startEdit(r)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => setDeleteId(r.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar receta"
        message="Si está usada en un evento, puede que no se pueda borrar."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
