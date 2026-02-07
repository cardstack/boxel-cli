import { CardDef, field, contains, Component } from 'https://cardstack.com/base/card-api';
import StringField from 'https://cardstack.com/base/string';
import NumberField from 'https://cardstack.com/base/number';
import ShoppingBagIcon from '@cardstack/boxel-icons/shopping-bag';

export class Product extends CardDef {
  static displayName = 'Product';
  static icon = ShoppingBagIcon;

  @field name = contains(StringField);
  @field description = contains(StringField);
  @field price = contains(NumberField);
  @field originalPrice = contains(NumberField); // For sale items
  @field imageEmoji = contains(StringField); // Emoji placeholder for image
  @field category = contains(StringField);
  @field rating = contains(NumberField); // 1-5
  @field reviewCount = contains(NumberField);
  @field inStock = contains(StringField); // "In Stock", "Low Stock", "Out of Stock"

  @field title = contains(StringField, {
    computeVia: function (this: Product) {
      return this.name || 'Untitled Product';
    },
  });

  // Atom: inline product pill
  static atom = class Atom extends Component<typeof Product> {
    <template>
      <span class="product-atom">
        {{#if @model.imageEmoji}}
          <span class="emoji">{{@model.imageEmoji}}</span>
        {{else}}
          <span class="emoji">📦</span>
        {{/if}}
        <span class="name">{{@model.name}}</span>
        <span class="price">${{@model.price}}</span>
      </span>
      <style scoped>
        .product-atom {
          display: inline-flex;
          align-items: center;
          gap: 0.35em;
          padding: 0.15em 0.6em;
          background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
          border: 1px solid #e9d5ff;
          border-radius: 100px;
          font-size: 0.9em;
        }
        .name {
          font-weight: 500;
          color: #7c3aed;
        }
        .price {
          color: #a78bfa;
          font-weight: 600;
        }
      </style>
    </template>
  };

  // Embedded: product card
  static embedded = class Embedded extends Component<typeof Product> {
    get stars() {
      const rating = this.args.model.rating || 0;
      return '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
    }

    get hasDiscount() {
      return this.args.model.originalPrice && this.args.model.originalPrice > (this.args.model.price || 0);
    }

    get discountPercent() {
      if (!this.hasDiscount) return 0;
      const orig = this.args.model.originalPrice || 0;
      const curr = this.args.model.price || 0;
      return Math.round((1 - curr / orig) * 100);
    }

    get stockClass() {
      const stock = this.args.model.inStock?.toLowerCase() || '';
      if (stock.includes('out')) return 'out-of-stock';
      if (stock.includes('low')) return 'low-stock';
      return 'in-stock';
    }

    <template>
      <article class="product-embedded">
        <div class="image-section">
          <div class="product-image">
            {{#if @model.imageEmoji}}
              {{@model.imageEmoji}}
            {{else}}
              📦
            {{/if}}
          </div>
          {{#if this.hasDiscount}}
            <span class="discount-badge">-{{this.discountPercent}}%</span>
          {{/if}}
        </div>
        <div class="info-section">
          {{#if @model.category}}
            <span class="category">{{@model.category}}</span>
          {{/if}}
          <h3 class="name">{{@model.name}}</h3>
          {{#if @model.description}}
            <p class="description">{{@model.description}}</p>
          {{/if}}
          <div class="rating-row">
            <span class="stars">{{this.stars}}</span>
            {{#if @model.reviewCount}}
              <span class="reviews">({{@model.reviewCount}})</span>
            {{/if}}
          </div>
          <div class="price-row">
            <span class="price">${{@model.price}}</span>
            {{#if this.hasDiscount}}
              <span class="original-price">${{@model.originalPrice}}</span>
            {{/if}}
          </div>
          {{#if @model.inStock}}
            <span class="stock {{this.stockClass}}">{{@model.inStock}}</span>
          {{/if}}
        </div>
      </article>
      <style scoped>
        .product-embedded {
          display: flex;
          gap: 1rem;
          padding: 1rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
        }
        .image-section {
          position: relative;
          flex-shrink: 0;
        }
        .product-image {
          width: 100px;
          height: 100px;
          background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3rem;
        }
        .discount-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #ef4444;
          color: white;
          padding: 0.2rem 0.5rem;
          border-radius: 100px;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .info-section {
          flex: 1;
          min-width: 0;
        }
        .category {
          display: inline-block;
          padding: 0.15rem 0.5rem;
          background: #f3f4f6;
          border-radius: 100px;
          font-size: 0.7rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .name {
          margin: 0.35rem 0;
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
        }
        .description {
          margin: 0 0 0.5rem;
          font-size: 0.85rem;
          color: #6b7280;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .rating-row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.85rem;
        }
        .stars {
          color: #fbbf24;
        }
        .reviews {
          color: #9ca3af;
        }
        .price-row {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          margin-top: 0.35rem;
        }
        .price {
          font-size: 1.25rem;
          font-weight: 700;
          color: #111827;
        }
        .original-price {
          font-size: 0.9rem;
          color: #9ca3af;
          text-decoration: line-through;
        }
        .stock {
          display: inline-block;
          margin-top: 0.35rem;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .in-stock { color: #16a34a; }
        .low-stock { color: #ea580c; }
        .out-of-stock { color: #dc2626; }
      </style>
    </template>
  };

  // Isolated: full product page
  static isolated = class Isolated extends Component<typeof Product> {
    get stars() {
      const rating = this.args.model.rating || 0;
      return '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
    }

    <template>
      <article class="product-isolated">
        <div class="product-image">
          {{#if @model.imageEmoji}}
            {{@model.imageEmoji}}
          {{else}}
            📦
          {{/if}}
        </div>
        <div class="product-info">
          {{#if @model.category}}
            <span class="category">{{@model.category}}</span>
          {{/if}}
          <h1 class="name">{{@model.name}}</h1>
          <div class="rating">
            <span class="stars">{{this.stars}}</span>
            {{#if @model.reviewCount}}
              <span class="reviews">{{@model.reviewCount}} reviews</span>
            {{/if}}
          </div>
          <div class="price">${{@model.price}}</div>
          {{#if @model.description}}
            <p class="description">{{@model.description}}</p>
          {{/if}}
          <button class="add-to-cart">Add to Cart</button>
        </div>
      </article>
      <style scoped>
        .product-isolated {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          display: flex;
          gap: 2rem;
          font-family: var(--boxel-font-family, system-ui);
        }
        .product-image {
          width: 300px;
          height: 300px;
          background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8rem;
          flex-shrink: 0;
        }
        .product-info {
          flex: 1;
        }
        .category {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          background: #f3f4f6;
          border-radius: 100px;
          font-size: 0.8rem;
          color: #6b7280;
          text-transform: uppercase;
        }
        .name {
          margin: 0.5rem 0;
          font-size: 2rem;
          color: #111827;
        }
        .rating {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .stars {
          font-size: 1.25rem;
          color: #fbbf24;
        }
        .reviews {
          color: #6b7280;
        }
        .price {
          font-size: 2.5rem;
          font-weight: 700;
          color: #111827;
          margin-bottom: 1rem;
        }
        .description {
          font-size: 1rem;
          line-height: 1.7;
          color: #4b5563;
          margin-bottom: 1.5rem;
        }
        .add-to-cart {
          padding: 1rem 2rem;
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
        }
      </style>
    </template>
  };
}
