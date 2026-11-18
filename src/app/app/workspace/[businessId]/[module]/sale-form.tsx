"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type ProductChoice = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  selling_price: number;
};

type CustomerChoice = { id: string; name: string };

export default function SaleForm({
  action,
  products,
  customers,
}: {
  action: string;
  products: ProductChoice[];
  customers: CustomerChoice[];
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedProduct = products.find((product) => product.id === productId);
  const parsedQuantity = Number(quantity);
  const total = selectedProduct && parsedQuantity > 0
    ? selectedProduct.selling_price * parsedQuantity
    : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    if (!event.currentTarget.reportValidity()) {
      event.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form className="workspace-module-form sale-form" action={action} method="post" onSubmit={submit}>
      <label className="workspace-module-field" htmlFor="sale-product">
        <span>Alaabta *</span>
        <select
          className="workspace-select"
          id="sale-product"
          name="product_id"
          onChange={(event) => {
            setProductId(event.target.value);
            setQuantity("");
          }}
          required
          value={productId}
        >
          <option disabled value="">Alaab dooro</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}{product.sku ? ` · ${product.sku}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="workspace-module-field" htmlFor="sale-quantity">
        <span>Tirada *{selectedProduct ? ` (kaydka: ${selectedProduct.quantity})` : ""}</span>
        <input
          id="sale-quantity"
          max={selectedProduct?.quantity}
          min="0.001"
          name="quantity"
          onChange={(event) => setQuantity(event.target.value)}
          required
          step="0.001"
          type="number"
          value={quantity}
        />
      </label>
      <label className="workspace-module-field" htmlFor="sale-customer">
        <span>Macaamil</span>
        <select className="workspace-select" defaultValue="" id="sale-customer" name="customer_id">
          <option value="">Macaamil guud</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.name}</option>
          ))}
        </select>
      </label>
      <button className="button button-dark" disabled={submitting || !selectedProduct} type="submit">
        {submitting ? "Iibka waa la xaqiijinayaa..." : "Iibka xaqiiji"}
      </button>
      {selectedProduct && (
        <p className="sale-form-summary" aria-live="polite">
          Qiime: {selectedProduct.selling_price}
          {total !== null && Number.isFinite(total) ? ` · Wadarta: ${total.toFixed(2)}` : ""}
        </p>
      )}
    </form>
  );
}
