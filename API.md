# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### SwaggerUi <a name="SwaggerUi" id="@tufweb-dev/cdk-constructs.SwaggerUi"></a>

#### Initializers <a name="Initializers" id="@tufweb-dev/cdk-constructs.SwaggerUi.Initializer"></a>

```typescript
import { SwaggerUi } from '@tufweb-dev/cdk-constructs'

new SwaggerUi(scope: Construct, id: string, props: SwaggerUiProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@tufweb-dev/cdk-constructs.SwaggerUi.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@tufweb-dev/cdk-constructs.SwaggerUi.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@tufweb-dev/cdk-constructs.SwaggerUi.Initializer.parameter.props">props</a></code> | <code><a href="#@tufweb-dev/cdk-constructs.SwaggerUiProps">SwaggerUiProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@tufweb-dev/cdk-constructs.SwaggerUi.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@tufweb-dev/cdk-constructs.SwaggerUi.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@tufweb-dev/cdk-constructs.SwaggerUi.Initializer.parameter.props"></a>

- *Type:* <a href="#@tufweb-dev/cdk-constructs.SwaggerUiProps">SwaggerUiProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@tufweb-dev/cdk-constructs.SwaggerUi.toString">toString</a></code> | Returns a string representation of this construct. |

---

##### `toString` <a name="toString" id="@tufweb-dev/cdk-constructs.SwaggerUi.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@tufweb-dev/cdk-constructs.SwaggerUi.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@tufweb-dev/cdk-constructs.SwaggerUi.isConstruct"></a>

```typescript
import { SwaggerUi } from '@tufweb-dev/cdk-constructs'

SwaggerUi.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@tufweb-dev/cdk-constructs.SwaggerUi.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@tufweb-dev/cdk-constructs.SwaggerUi.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |

---

##### `node`<sup>Required</sup> <a name="node" id="@tufweb-dev/cdk-constructs.SwaggerUi.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---


## Structs <a name="Structs" id="Structs"></a>

### SwaggerUiProps <a name="SwaggerUiProps" id="@tufweb-dev/cdk-constructs.SwaggerUiProps"></a>

#### Initializer <a name="Initializer" id="@tufweb-dev/cdk-constructs.SwaggerUiProps.Initializer"></a>

```typescript
import { SwaggerUiProps } from '@tufweb-dev/cdk-constructs'

const swaggerUiProps: SwaggerUiProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@tufweb-dev/cdk-constructs.SwaggerUiProps.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.LogGroup</code> | *No description.* |

---

##### `logGroup`<sup>Optional</sup> <a name="logGroup" id="@tufweb-dev/cdk-constructs.SwaggerUiProps.property.logGroup"></a>

```typescript
public readonly logGroup: LogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.LogGroup

---



