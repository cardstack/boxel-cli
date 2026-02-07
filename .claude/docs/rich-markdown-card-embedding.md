# RichMarkdown Card Embedding Syntax

This document describes how to create RichMarkdown card instances with embedded card references.

## Overview

RichMarkdown supports embedding other cards inline or as blocks. The system uses **numeric indices** in the markdown content that map to a **linkedCards relationship array**.

## Content Syntax

### Inline Card Reference (Atom Format)

```markdown
:card[Label]{id=INDEX}
```

- `Label` - Display text shown for the card link
- `INDEX` - Numeric index into the linkedCards array (0-based)

**Examples:**
```markdown
Mention a person: :card[Jamie]{id=0}
Assigned to :card[Sarah]{id=1} by :card[Jamie]{id=0}
```

### Block Card Embed

```markdown
::card{id=INDEX format=FORMAT}
```

- `INDEX` - Numeric index into the linkedCards array (0-based)
- `FORMAT` - One of: `atom`, `embedded`, `fitted`, `isolated`

**Examples:**
```markdown
::card{id=0 format=embedded}
::card{id=1 format=fitted}
::card{id=2 format=atom}
```

### Container Card (Isolated Format)

```markdown
:::card{id=INDEX format=isolated}
:::
```

**Example:**
```markdown
:::card{id=0 format=isolated}
:::
```

## JSON Structure

### Relationships Format

The `linkedCards` relationship uses **indexed keys** that correspond to the indices used in the content:

```json
{
  "data": {
    "relationships": {
      "content.linkedCards.0": {
        "links": {
          "self": "./Person/jamie-chen"
        }
      },
      "content.linkedCards.1": {
        "links": {
          "self": "./Person/sarah-williams"
        }
      },
      "content.linkedCards.2": {
        "links": {
          "self": "./Task/deploy-staging"
        }
      },
      "content.linkedCards.3": {
        "links": {
          "self": "./Task/run-tests"
        }
      }
    }
  }
}
```

### Key Points

1. **Indexed relationship keys**: Use `content.linkedCards.N` where N is the index
2. **Relative paths**: Use relative paths like `./Person/jamie-chen` or `../Task/deploy-staging`
3. **Zero-based indexing**: First card is index 0
4. **Order matters**: The index in markdown must match the relationship key

### Full Example

```json
{
  "data": {
    "meta": {
      "adoptsFrom": {
        "name": "RichMarkdown",
        "module": "../rich-markdown"
      }
    },
    "type": "card",
    "attributes": {
      "content": {
        "content": "# Team Tasks\n\nAssigned to: :card[Jamie]{id=0}\n\n## Current Task\n\n::card{id=1 format=fitted}"
      },
      "cardTitle": "Team Tasks"
    },
    "relationships": {
      "content.linkedCards.0": {
        "links": {
          "self": "./Person/jamie-chen"
        }
      },
      "content.linkedCards.1": {
        "links": {
          "self": "./Task/deploy-staging"
        }
      }
    }
  }
}
```

## Index Mapping Convention

When creating content with multiple card references, document the index mapping:

```markdown
Index reference:
- 0 = Jamie (Person)
- 1 = Sarah (Person)
- 2 = Deploy (Task)
- 3 = Tests (Task)
```

This helps maintain clarity when the content uses many card references.

## Path Formats

### Relative Paths (Recommended)

```json
"self": "./Person/jamie-chen"      // Same directory level
"self": "../Task/deploy-staging"   // Parent directory
```

### Absolute URLs (Also Supported)

```json
"self": "https://realms-staging.stack.cards/ctse/integral-wolverine/Person/jamie-chen"
```

## Formats Reference

| Format | Use Case | Display |
|--------|----------|---------|
| `atom` | Inline mentions | Small pill/chip |
| `embedded` | Block embed, default style | Card in document flow |
| `fitted` | Block embed, constrained size | Card fits container |
| `isolated` | Full card view | Complete card rendering |

## Common Mistakes to Avoid

1. **Using URLs in content**: Don't use `::card{id=https://...}` - use numeric indices
2. **Missing relationship**: Every index used in content must have a corresponding `content.linkedCards.N` relationship
3. **Wrong index**: Index mismatch between content and relationships causes "[Card N not found]" errors
4. **Array format in relationships**: Don't use array format - use indexed keys (`content.linkedCards.0`, not `content.linkedCards: [...]`)
