import { CardDef, field, contains, containsMany, Component, FieldDef } from 'https://cardstack.com/base/card-api';
import StringField from 'https://cardstack.com/base/string';
import NumberField from 'https://cardstack.com/base/number';
import ReceiptIcon from '@cardstack/boxel-icons/receipt';

class LineItem extends FieldDef {
  @field name = contains(StringField);
  @field quantity = contains(NumberField);
  @field price = contains(NumberField);
}

export class Receipt extends CardDef {
  static displayName = 'Receipt';
  static icon = ReceiptIcon;

  @field merchantName = contains(StringField);
  @field merchantAddress = contains(StringField);
  @field date = contains(StringField);
  @field time = contains(StringField);
  @field items = containsMany(LineItem);
  @field subtotal = contains(NumberField);
  @field tax = contains(NumberField);
  @field total = contains(NumberField);
  @field paymentMethod = contains(StringField);
  @field lastFour = contains(StringField);

  @field title = contains(StringField, {
    computeVia: function (this: Receipt) {
      return `${this.merchantName || 'Receipt'} - $${this.total?.toFixed(2) || '0.00'}`;
    },
  });

  // Atom: inline receipt reference
  static atom = class Atom extends Component<typeof Receipt> {
    <template>
      <span class="receipt-atom">
        <span class="icon">🧾</span>
        <span class="merchant">{{@model.merchantName}}</span>
        <span class="total">${{@model.total}}</span>
      </span>
      <style scoped>
        .receipt-atom {
          display: inline-flex;
          align-items: center;
          gap: 0.35em;
          padding: 0.15em 0.6em;
          background: linear-gradient(135deg, #f5f5f4 0%, #e7e5e4 100%);
          border: 1px solid #d6d3d1;
          border-radius: 100px;
          font-size: 0.9em;
        }
        .merchant {
          font-weight: 500;
          color: #44403c;
        }
        .total {
          color: #78716c;
          font-family: 'SF Mono', monospace;
        }
      </style>
    </template>
  };

  // Embedded: thermal receipt style
  static embedded = class Embedded extends Component<typeof Receipt> {
    <template>
      <div class="receipt-embedded">
        <div class="receipt-paper">
          <header class="merchant-header">
            <div class="merchant-name">{{@model.merchantName}}</div>
            {{#if @model.merchantAddress}}
              <div class="merchant-address">{{@model.merchantAddress}}</div>
            {{/if}}
            <div class="datetime">{{@model.date}} {{@model.time}}</div>
          </header>

          <div class="divider">--------------------------------</div>

          <div class="items">
            {{#each @model.items as |item|}}
              <div class="item-row">
                <span class="item-name">{{item.name}}</span>
                <span class="item-qty">x{{item.quantity}}</span>
                <span class="item-price">${{item.price}}</span>
              </div>
            {{/each}}
          </div>

          <div class="divider">--------------------------------</div>

          <div class="totals">
            <div class="total-row">
              <span>Subtotal</span>
              <span>${{@model.subtotal}}</span>
            </div>
            <div class="total-row">
              <span>Tax</span>
              <span>${{@model.tax}}</span>
            </div>
            <div class="total-row grand-total">
              <span>TOTAL</span>
              <span>${{@model.total}}</span>
            </div>
          </div>

          <div class="divider">--------------------------------</div>

          <div class="payment">
            <span>{{@model.paymentMethod}}</span>
            {{#if @model.lastFour}}
              <span>****{{@model.lastFour}}</span>
            {{/if}}
          </div>

          <footer class="receipt-footer">
            <div>Thank you for your purchase!</div>
            <div class="barcode">||||| |||| ||||| |||| |||||</div>
          </footer>
        </div>
      </div>
      <style scoped>
        .receipt-embedded {
          display: flex;
          justify-content: center;
        }
        .receipt-paper {
          width: 280px;
          padding: 1rem;
          background: #fffef9;
          border: 1px solid #e5e5e5;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          font-family: 'Courier New', Courier, monospace;
          font-size: 0.8rem;
          line-height: 1.4;
        }
        .merchant-header {
          text-align: center;
          margin-bottom: 0.5rem;
        }
        .merchant-name {
          font-weight: bold;
          font-size: 1rem;
          text-transform: uppercase;
        }
        .merchant-address {
          font-size: 0.7rem;
          color: #666;
        }
        .datetime {
          margin-top: 0.25rem;
          font-size: 0.75rem;
        }
        .divider {
          text-align: center;
          color: #ccc;
          font-size: 0.65rem;
          margin: 0.5rem 0;
          letter-spacing: -1px;
        }
        .items {
          margin: 0.5rem 0;
        }
        .item-row {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .item-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .item-qty {
          color: #888;
        }
        .totals {
          margin: 0.5rem 0;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
        }
        .grand-total {
          font-weight: bold;
          font-size: 1rem;
          margin-top: 0.25rem;
          padding-top: 0.25rem;
          border-top: 1px dashed #ccc;
        }
        .payment {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: #666;
        }
        .receipt-footer {
          text-align: center;
          margin-top: 1rem;
          font-size: 0.7rem;
        }
        .barcode {
          margin-top: 0.5rem;
          font-size: 1.5rem;
          letter-spacing: 2px;
          color: #333;
        }
      </style>
    </template>
  };

  // Isolated: detailed receipt view
  static isolated = class Isolated extends Component<typeof Receipt> {
    <template>
      <article class="receipt-isolated">
        <div class="receipt-card">
          <header class="header">
            <h1 class="merchant">{{@model.merchantName}}</h1>
            <p class="address">{{@model.merchantAddress}}</p>
            <p class="datetime">{{@model.date}} at {{@model.time}}</p>
          </header>

          <section class="items-section">
            <h2>Items</h2>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {{#each @model.items as |item|}}
                  <tr>
                    <td>{{item.name}}</td>
                    <td>{{item.quantity}}</td>
                    <td>${{item.price}}</td>
                  </tr>
                {{/each}}
              </tbody>
            </table>
          </section>

          <section class="totals-section">
            <div class="row"><span>Subtotal</span><span>${{@model.subtotal}}</span></div>
            <div class="row"><span>Tax</span><span>${{@model.tax}}</span></div>
            <div class="row total"><span>Total</span><span>${{@model.total}}</span></div>
          </section>

          <section class="payment-section">
            <span class="method">{{@model.paymentMethod}}</span>
            {{#if @model.lastFour}}
              <span class="card">ending in {{@model.lastFour}}</span>
            {{/if}}
          </section>
        </div>
      </article>
      <style scoped>
        .receipt-isolated {
          max-width: 500px;
          margin: 0 auto;
          padding: 2rem;
          font-family: var(--boxel-font-family, system-ui);
        }
        .receipt-card {
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          padding: 1.5rem;
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          color: white;
          text-align: center;
        }
        .merchant {
          margin: 0;
          font-size: 1.5rem;
        }
        .address, .datetime {
          margin: 0.25rem 0 0;
          opacity: 0.8;
          font-size: 0.9rem;
        }
        .items-section {
          padding: 1.5rem;
        }
        .items-section h2 {
          margin: 0 0 1rem;
          font-size: 0.9rem;
          text-transform: uppercase;
          color: #888;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
        }
        .items-table th, .items-table td {
          padding: 0.5rem;
          text-align: left;
          border-bottom: 1px solid #f0f0f0;
        }
        .items-table th {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #888;
        }
        .totals-section {
          padding: 1rem 1.5rem;
          background: #f9fafb;
        }
        .row {
          display: flex;
          justify-content: space-between;
          padding: 0.25rem 0;
        }
        .row.total {
          font-weight: bold;
          font-size: 1.25rem;
          padding-top: 0.5rem;
          border-top: 2px solid #e5e7eb;
          margin-top: 0.5rem;
        }
        .payment-section {
          padding: 1rem 1.5rem;
          display: flex;
          justify-content: space-between;
          border-top: 1px solid #e5e7eb;
          color: #666;
          font-size: 0.9rem;
        }
      </style>
    </template>
  };
}
