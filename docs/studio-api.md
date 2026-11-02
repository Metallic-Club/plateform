# Metallic Studio API inventory

Every API the studio repository (`Metallic-Club/studio`) exposes, gathered on 2026-11-02 from
commit `c007d154cc1df5be208d15b45ddcfd357018ce10` (2026-11-01, "Merge pull request #505").

Two surfaces exist and they are different things:

| Surface | Used by | Where it lives |
|---|---|---|
| **Luau scripting API** — Roblox-style globals, classes, datatypes and services | Game code in `Script` / `LocalScript` | `crates/metallic_script/src/api/`, documented in `docs/luau-api.md` |
| **Rust engine API** — the crates other Metallic binaries link against | Studio, player, launcher, tools | 21 crates under `crates/`, `pub` items in each `lib.rs` |

There is **no HTTP or JSON API** in this repository. `metallic_net` carries a QUIC and an in-memory
transport with its own wire encoding for multiplayer; replication is not implemented yet. The
website/backend is the `Metallic-Club/plateform` repository, not this one.

This file is a compiled reference. The live source of truth is the studio repository; if the two
disagree, the repository wins.

## 1. Luau scripting API

### Execution model

- `Script` runs in the **server VM**, `LocalScript` in the **client VM** (one local player, `Player1`, in the
  default combined host).
- Errors read `<Instance full name>:<line>: <message>` and go to the output sink; one failing script or
  handler never stops the others.
- Every call into a script (start, handler, `Heartbeat`, remote) has a **0.1 s** budget. All handlers of one
  step share a **0.25 s** budget per VM.
- Hosts: `ScriptHost::new` (combined), `ScriptHost::new_server`, `ScriptHost::with_role(world, output,
  ScriptRole::{Combined, Server, Client})`. Lifecycle: `add_player`, `remove_player`, `set_local_player`,
  `stop`.

### Globals

`game`, `workspace`, `script`, `print`, `warn`, `task` (`wait`, `spawn`, `delay`), `require`, `Instance`,
`Vector3`, `Vector2`, `CFrame`, `Color3`, `UDim2`, `Ray`, `Enum`.

### Instance

- Constructors: `Instance.new(class, parent?)`. Services and abstract classes (`BasePart`, `PVInstance`, …)
  cannot be created; an unknown class errors.
- Members: `Name`, `Parent`, `ClassName` (read-only), `FindFirstChild(name, recursive?)`,
  `WaitForChild(name, timeout?)`, `GetChildren()`, `GetDescendants()`, `IsA(class)`, `Destroy()`, `Clone()`,
  plus every registry property of the class by name.
- `instance.ChildName` finds a child. Unknown member: `<Name> is not a valid member of <ClassName>`.
- Member keys must be strings; the same instance is always the same Lua object; a destroyed instance errors
  on use; services cannot be destroyed, cloned or reparented.
- `WaitForChild` yields and returns `nil` after its timeout; without one it warns once after 5 s.

### Classes known to the script layer

`BasePart`, `Model`, `Humanoid`, `Camera`, `ModuleScript`, `Player`, `Players`, `RemoteEvent`,
`RunService`, `Workspace`, plus the GUI classes `ScreenGui`, `Frame`, `TextLabel`, `TextButton`,
`ImageButton`, `GuiButton`, and the client-only `InputAction` and the read-only `TouchButton` the touch
overlay hands back.

### Attributes

- `inst:SetAttribute(name, value)` (`nil` removes), `GetAttribute(name)`, `GetAttributes()`.
- Types: boolean, number, string, `Vector3`, `Color3`, `UDim2`, `CFrame`, `nil`. Strings ≤ 65,536 bytes; at
  most 1,024 attributes per instance.
- Names: 1–100 ASCII letters, digits and `_`, not starting with `RBX` (any case).
- `AttributeChanged` and `GetAttributeChangedSignal(name)`. A world holds at most 16 MiB of attribute data.

### Tags and `CollectionService`

`AddTag`, `RemoveTag`, `HasTag`, `GetTags`, `GetTagged`, `GetAllTags`, `GetInstanceAddedSignal`,
`GetInstanceRemovedSignal`; the same four short forms exist as instance methods. A tag is 1–255 bytes
without control characters; at most 256 tags per instance; signals for at most 4,096 tag names per VM.

### Camera

`workspace.CurrentCamera` with `CFrame`, `FieldOfView` (1–120, default 70), `CameraType`
(`Enum.CameraType.Custom`, `Scriptable`, `Fixed`) and read-only `ViewportSize`.

- `ViewportPointToRay(x, y, depth?)`, `ScreenPointToRay(x, y, depth?)`, `WorldToViewportPoint(point)`,
  `WorldToScreenPoint(point)`.
- `Ray.new(origin, direction)` with `Origin`, `Direction`, `Unit`, `ClosestPoint(point)`, `Distance(point)`.

### Datatypes

| Type | Constructor | Members |
|---|---|---|
| `Vector3` | `Vector3.new(x, y, z)` | `X Y Z Magnitude Unit`; `+ - * /`, unary `-`, `==` (f64 precision) |
| `Vector2` | `Vector2.new(x, y)` | `X Y Magnitude Unit`; `+ -`, `* /`, unary `-`, `==` |
| `CFrame` | `new()`, `new(pos)`, `new(pos, lookAt)`, `new(x,y,z)`, `new(x,y,z,qx,qy,qz,qw)`, 12-number `new`, `identity`, `lookAt`, `Angles`, `fromEulerAnglesXYZ/YXZ`, `fromEulerAngles`, `fromAxisAngle`, `fromMatrix` | `Position X Y Z Rotation LookVector RightVector UpVector XVector YVector ZVector`; `Inverse`, `Lerp`, `ToWorldSpace`, `ToObjectSpace`, `PointToWorldSpace`, `PointToObjectSpace`, `VectorToWorldSpace`, `VectorToObjectSpace`, `GetComponents`, `ToEulerAnglesXYZ/YXZ`, `ToOrientation`, `ToEulerAngles`, `ToAxisAngle`, `Orthonormalize`, `FuzzyEq`; `* + - ==`, `tostring` |
| `Color3` | `Color3.fromRGB(r, g, b)` | `R G B` (0–1) |
| `UDim2` | `UDim2.new(xs, xo, ys, yo)` | `X`, `Y` as `{Scale, Offset}` |

### Pivots, size and scale

Roblox's `PVInstance` API on `BasePart` and `Model`: `GetPivot`, `PivotTo`, `PivotOffset`, `WorldPivot`,
`PrimaryPart`, `Resize(face, delta)` with `Enum.NormalId`, `ScaleTo`, `GetScale`, `GetBoundingBox`,
`GetExtentsSize`. Part size is 0.001–2048 studs per axis.

### Signals

`signal:Connect(fn)` returns a connection with `:Disconnect()` and `.Connected`. Handlers run in their own
thread and may `task.wait`.

| Signal | Arguments | Fires when |
|---|---|---|
| `BasePart.Touched` | `hit` | a character part touches the part |
| `BasePart.TouchEnded` | `hit` | the contact ends |
| `Humanoid.Died` | — | the character dies |
| `Player.CharacterAdded` | `model` | the character spawns |
| `Players.PlayerAdded` | `player` | a player joins |
| `Players.PlayerRemoving` | `player` | a player leaves |
| `RunService.Heartbeat` | `dt` | every step |
| `AttributeChanged` | `name` | an attribute is set, changed or removed |
| `GetInstanceAddedSignal` / `GetInstanceRemovedSignal` | `instance` | a tagged instance enters or leaves the game |
| GUI: `MouseButton1Down`, `MouseButton1Up`, `MouseButton1Click`, `Activated`, `MouseEnter`, `MouseLeave`, `InputBegan`, `InputChanged`, `InputEnded` | input object / coordinates | pointer and touch input on a GUI element |
| `InputAction`: `Pressed`, `Released`, `Triggered(value)`, `StateChanged(value)` | value | the action changes |

At most 10,000 connections per signal.

### Services

`game:GetService(name)` or `game.Name`, for these 11 names:

`Workspace`, `Players`, `ReplicatedStorage`, `ServerScriptService`, `StarterPlayer`, `StarterGui`,
`Lighting`, `RunService`, `UserInputService`, `ContextActionService`, `CollectionService`.

Anything else errors with `'Foo' is not a valid Service name`.

- `Players.LocalPlayer` (client only), `Players:GetPlayers()`, `Players:GetPlayerFromCharacter(model)`.
- Player: `UserId`, `Character`, `CharacterAdded`. `PlayerGui` is created for the local player.
- `Humanoid:TakeDamage(n)`; `Health`/`MaxHealth` clamp to 0–1e9, `WalkSpeed`/`JumpPower` to 0–1,000,
  `MaxSlopeAngle` to 0–89. Death at `Health` 0, below `Workspace.FallenPartsDestroyHeight`, or beyond
  1,000,000 studs from the origin.
- `RunService:IsServer()`, `IsClient()`, `Heartbeat`.

### Tasks and coroutines

`task.spawn`, `task.delay`, `task.wait`; user coroutines that call `task.wait` are adopted by the scheduler.
`pcall` and `xpcall` are unchanged.

### GUI

`ScreenGui` (`Enabled`, `DisplayOrder`), `Frame` (`Position`, `Size`, `BackgroundColor3`,
`BackgroundTransparency`, `Visible`, `ZIndex`, `Active`, `ClipsDescendants`), `TextLabel` (`Text`,
`TextColor3`, `TextSize`), `TextButton`, `ImageButton` (`Image`, `ImageColor3`, `ImageTransparency`;
images are not drawn yet), `GuiButton` (`AutoButtonColor`). At most 256 GUI events wait at once.

### RemoteEvent

`FireServer(...)` (client), `FireClient(player, ...)` and `FireAllClients(...)` (server), `OnServerEvent`
(server), `OnClientEvent` (client). Payloads: nil, boolean, number, string, `Vector3`, `Vector2`, `Color3`,
`UDim2`, `Instance`, and tables of those up to 16 levels. Limits: 32 arguments, 10,000 values and 1 MB of
strings per call; 1,000 messages and 16 MB queued per VM per step.

### Input (client only)

- `Enum.KeyCode`, `Enum.UserInputType`, `Enum.UserInputState`, `Enum.InputActionType`, `Enum.InputTrigger`,
  `Enum.TouchSlot`, `Enum.ContextActionResult`, `Enum.PreferredInput`, `Enum.RotationOrder`,
  `Enum.NormalId`, `Enum.ContextActionPriority` (`Low` 1000, `Medium` 2000, `High` 3000).
- `InputAction`: `GetState()`, `GetHoldProgress()`, `Pressed`, `Released`, `Triggered`, `StateChanged`.
- `ContextActionService`: `BindAction`, `BindActionAtPriority`, `UnbindAction`, `SetTitle`, `SetImage`,
  `SetPosition`, `GetButton`. At most 256 bound actions per script.
- `UserInputService`: `GetLastInputType()`, `LastInputTypeChanged`, `PreferredInput`, `TouchEnabled`,
  `KeyboardEnabled`, `GamepadEnabled`.

### Limits worth knowing

| Area | Limit |
|---|---|
| Script call budget | 0.1 s per call; 0.25 s shared per step per VM |
| Handlers | a script timing out 3 times in a row is disconnected |
| Attributes | 16 MiB per world, 1,024 per instance, 4,096 names per VM |
| Tags | 16 MiB shared with attributes, 256 per instance, 4,096 tag names per VM |
| Signals | 10,000 connections per signal |
| Remote | see RemoteEvent above |
| Pattern matching | 10 million charged steps, 200 matcher depth, 32 captures, 64 MB gsub result |
| Input | 16 action events per step, 1,024 queued, 256 bound actions per script |
| GUI | 256 waiting events |
| Metatables | protected: `getmetatable` returns false, `setmetatable` errors |

### Not in the API yet (milestone 1)

Replication and multiplayer, a dedicated-server process, `UserInputService` raw events, and building tools.
In combined mode the client VM writes to the same `World` as the server VM, so a `LocalScript` can change
server-owned state; that is accepted for M1.

## 2. Rust crate API

21 workspace crates, `version 0.1.1`, `edition 2024`, licence `LicenseRef-Metallic-Proprietary`,
`publish = false`. Item counts are `pub fn|struct|enum|trait|type|const|static|mod|use` declarations.

| Crate | Role | Public items | Headline exports |
|---|---|---|---|
| `metallic_core` | Instance tree, class registry, scene files, `CFrame`, Lighting | 494 | `World`, `InstanceId`, `CFrame`, `RotationOrder`, `classes`, `transform`, `replication` |
| `metallic_script` | Sandboxed Luau, the API above, debugger | 123 | `ScriptHost`, `ScriptRole`, `GuiEvent`, `Debugger`, `Breakpoint` |
| `metallic_runtime` | One running game: world, physics, characters, camera, GUI, input | 477 | `Game`, `FrameOutput`, `CameraController`, `InputRuntime`, `gui`, `gui_input` |
| `metallic_render` | wgpu renderer: materials, shadows, sky, fog, post, tone mapping | 218 | `camera`, `lighting`, `bloom`, `exposure`, `lut`, `edges` |
| `metallic_physics` | Rapier 3D, Humanoid controller, death and respawn | 82 | `BodyPart`, `BodyPose`, `MaterialProps`, `MAX_TOUCH_CANDIDATES` |
| `metallic_physics2d` | 2D physics | 95 | `Pose2`, `Vec2`, `SensorEvent`, `Physics2dError` |
| `metallic_asset` | glTF skinned characters | 37 | `Skeleton`, `Clip`, `Pose`, `Track`, `Transform` |
| `metallic_anim` | Animation data and state machines | 219 | `Curve`, `Keyframe`, `animator`, `clip`, `ik`, `easing` |
| `metallic_meshgen` | Part shape meshes | 80 | `MeshCache`, `MeshData`, `ColliderPart`, `collider_hint` |
| `metallic_modeling` | Modeller core | 241 | `command`, `geom`, `mesh`, `export`, `ids` |
| `metallic_audio` | Audio engine | 134 | `AudioEngine`, `AudioBackend`, `SoundAsset`, `effects` |
| `metallic_vfx` | Visual effects | 222 | `effect`, `draw`, `curve`, `gpu`, `color` |
| `metallic_vfx_editor` | VFX editor | 92 | `VfxEditor`, `Selection`, `View`, `inspector`, `preview` |
| `metallic_anim_editor` | Curve and clip editor widgets | 100 | `CurveEditor`, `curve_editor`, `scalar`, `preview` |
| `metallic_net` | QUIC and in-memory transports, wire encoding | 129 | `transport`, `wire`, `NetError` |
| `metallic_tokens` | Design tokens shared by Studio and Launcher | 143 | token constants in `consts` |
| `metallic_ui_theme` | Theme choice, fonts, icons | 92 | `ThemeChoice`, `saved_theme_choice`, `fonts`, `icons` |
| `metallic_update` | Update feed and GitHub sign-in | 70 | `download_verified`, `feed`, `github_auth`, `http`, `secret` |
| `metallic_studio` | The Studio editor binary | 1585 | `actions`, `app`, `camera`, `commands`, `input_actions`, `tools` |
| `metallic_player` | The `metallic-player` binary | 185 | menu, controls and the headless run options in `main.rs` |
| `metallic_launcher` | The launcher shell around the platform website | 295 | `app_event`, `bridge`, `deep_link`, `install`, `data_dirs` |

## 3. Where the API lives

| Path | Contents |
|---|---|
| `crates/metallic_script/src/api/mod.rs` | Global install and the table handed to every VM |
| `crates/metallic_script/src/api/instance.rs` | Instance members, registry property access |
| `crates/metallic_script/src/api/attributes.rs` | `SetAttribute` family and its log |
| `crates/metallic_script/src/api/tags.rs` | `CollectionService` |
| `crates/metallic_script/src/api/cframe.rs` | The `CFrame` userdata |
| `crates/metallic_script/src/api/datatypes.rs` | `Vector3`, `Vector2`, `Color3`, `UDim2` |
| `crates/metallic_script/src/api/camera.rs` | Camera and `Ray` |
| `crates/metallic_script/src/api/pivot.rs` | `PVInstance`, `Resize`, `ScaleTo` |
| `crates/metallic_script/src/api/signals.rs` | Signal and connection objects |
| `crates/metallic_script/src/api/services.rs` | `game`, `GetService`, `Players`, `Humanoid` |
| `crates/metallic_script/src/api/gui.rs` | GUI classes and their events |
| `crates/metallic_script/src/api/remote.rs` | `RemoteEvent` |
| `crates/metallic_script/src/api/input.rs` | Enums, `InputAction`, `ContextActionService`, `UserInputService` |
| `crates/metallic_script/src/api/require.rs` | `ModuleScript` and `require` |
| `crates/metallic_core/src/classes/` | One file per class, resolved into flat property tables |
| `docs/luau-api.md` | The studio repository's own scripting reference |
