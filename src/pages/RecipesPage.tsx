import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Ingredient, type Recipe } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  type ServiceType,
} from "../../shared/types";

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
  const [suitable, setSuitable] = useState<ServiceType[]>([]);
  const [ings, setIngs] = useState<IngRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterService, setFilterService] = useState<ServiceType | "">("");

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
    setSuitable([]);
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
    setSuitable(r.suitableServices ?? []);
    setIngs(r.ingredients.map((x) => ({ ingredientId: x.ingredientId, quantity: x.quantity })));
  }

  function toggleService(s: ServiceType) {
    setSuitable((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ingredients = ings.filter((x) => x.ingredientId && x.quantity > 0);
    if (ingredients.length === 0) {
      setError("Agrega al menos un ingrediente a la receta");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        yieldPortions: form.yieldPortions,
        category: form.category || null,
        suitableServices: suitable,
        instructions: form.instructions || null,
        estimatedCost: form.estimatedCost === "" ? null : Number(form.estimatedCost),
        ingredients,
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

  const visible = filterService
    ? recipes.filter(
        (r) =>
          !r.suitableServices.length || r.suitableServices.includes(filterService),
      )
    : recipes;

  return (
    <div>
      <PageHeader
        title="Recetas"
        subtitle="Define cuánto rinde cada plato y sus ingredientes. En el evento se escalan según los asistentes."
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
              placeholder="Ej. Pollo al limón"
            />
          </FormField>

          <FormField
            label="Rinde (porciones base) *"
            hint={`Esta receta rinde ${form.yieldPortions || "?"} porciones. En el evento se escalará según los asistentes.`}
          >
            <input
              type="number"
              min={1}
              value={form.yieldPortions}
              onChange={(e) => setForm({ ...form, yieldPortions: Number(e.target.value) })}
              required
            />
          </FormField>

          <div>
            <div className="field-label" style={{ marginBottom: 8 }}>
              Sirve para (opcional)
            </div>
            <p className="meta" style={{ marginTop: 0, marginBottom: 8 }}>
              Marca desayuno, almuerzo, etc. Así el planificador del evento te sugiere esta receta.
              Si no marcas nada, aparece en todos los servicios.
            </p>
            <div className="chips">
              {SERVICE_TYPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip ${suitable.includes(s) ? "on" : ""}`}
                  onClick={() => toggleService(s)}
                >
                  {SERVICE_TYPE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <FormField label="Tipo de plato" hint="Ej. Entrada, Principal, Postre">
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ej. Principal"
            />
          </FormField>

          <FormField label="Costo estimado (opcional)">
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
              <div>
                <h3 style={{ margin: 0 }}>Ingredientes (para {form.yieldPortions} porciones)</h3>
                <p className="meta" style={{ margin: "4px 0 0" }}>
                  Indica la cantidad de cada ingrediente para el rendimiento base.
                </p>
              </div>
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
            {ings.length === 0 ? (
              <p className="meta">Agrega al menos un ingrediente para poder generar compras.</p>
            ) : null}
            {ings.map((row, idx) => {
              const unit =
                ingredients.find((i) => i.id === row.ingredientId)?.unit ?? "";
              return (
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
                          {ing.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label={`Cantidad (${unit || "unidad"})`}>
                    <div className="qty-with-unit">
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
                      <span className="unit-tag">{unit}</span>
                    </div>
                  </FormField>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => setIngs(ings.filter((_, i) => i !== idx))}
                  >
                    Quitar
                  </button>
                </div>
              );
            })}
            {!ingredients.length ? (
              <p className="meta">
                No hay ingredientes.{" "}
                <Link to="/ingredientes">Crear en el catálogo</Link>
              </p>
            ) : null}
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
          <div className="page-header" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Listado</h2>
            <select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value as ServiceType | "")}
              aria-label="Filtrar por servicio"
              style={{ maxWidth: 180 }}
            >
              <option value="">Todos los servicios</option>
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {SERVICE_TYPE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <div className="loading">Cargando…</div>
          ) : visible.length === 0 ? (
            <EmptyState
              title="Sin recetas"
              description="Crea tu primera receta con rendimiento e ingredientes."
            />
          ) : (
            <div className="list" style={{ marginTop: 12 }}>
              {visible.map((r) => (
                <div key={r.id} className="list-item">
                  <div>
                    <h3>{r.name}</h3>
                    <div className="meta">
                      Rinde {r.yieldPortions} porciones · {r.ingredients.length} ingredientes
                      {r.category ? ` · ${r.category}` : ""}
                    </div>
                    {r.suitableServices.length ? (
                      <div className="chip-row" style={{ marginTop: 6 }}>
                        {r.suitableServices.map((s) => (
                          <span key={s} className="badge tone-info">
                            {SERVICE_TYPE_LABELS[s]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="meta" style={{ marginTop: 4 }}>
                        Sirve para cualquier servicio
                      </div>
                    )}
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
