# Cross-Collection Improvements

## Learnings from Convex and Zero Sync

Based on research into how Convex and Zero Sync handle cross-collection dependencies, we've implemented several key improvements to payload-sync:

## 1. **Automatic Dependency Tracking** (Convex-inspired)

**File**: `src/utilities/dependency-tracker.ts`

**What we learned**: Convex automatically tracks all data dependencies during query execution and invalidates affected queries when any dependency changes.

**What we implemented**:
- Automatic extraction of dependencies from `populate` and `where` clauses
- Reverse dependency mapping to quickly find affected queries
- Registration/unregistration of query dependencies

**Example**:
```typescript
// When this query is registered:
usePayloadQuery({
  type: 'find',
  collection: 'tasks',
  populate: { assignee: true },
  where: { 'assignee.status': 'active' }
})

// The system automatically detects dependencies on:
// - 'tasks' collection (direct)
// - 'users' collection (via populate and where clause)
```

## 2. **Cross-Collection Change Propagation** (Both systems)

**File**: `src/utilities/incremental-publisher.ts`

**What we learned**: Both systems ensure that when related data changes, all affected queries are updated automatically.

**What we implemented**:
- Modified `publishIncrementalChanges` to handle both direct and dependent subscriptions
- Automatic detection of cross-collection updates
- Proper logging to distinguish between direct and dependent updates

**Example**:
```typescript
// When a user's name changes:
// 1. Direct subscriptions to 'users' collection get updated
// 2. Dependent subscriptions (like tasks with assignee populated) also get updated
// 3. System logs: "Publishing update for users:123 to 5 subscriptions (2 direct, 3 dependent)"
```

## 3. **Efficient Bandwidth Usage** (Zero Sync-inspired)

**File**: `src/utilities/cross-collection-optimizer.ts`

**What we learned**: Zero Sync uses incremental updates and only sends specific changes rather than full query re-execution.

**What we implemented**:
- `CrossCollectionOptimizer` class that identifies affected documents
- Batch fetching of only affected documents
- Reverse relationship queries to find impacted records
- Fallback to full refresh if optimization fails

**Example**:
```typescript
// Instead of re-fetching ALL tasks when a user changes:
// 1. Find which tasks are assigned to the changed user
// 2. Fetch only those specific tasks with updated population
// 3. Send targeted updates for just those tasks
// 4. Saves bandwidth and improves performance
```

## 4. **Query Invalidation Strategy** (Convex-inspired)

**File**: `src/utilities/query-invalidation.ts`

**What we learned**: Convex uses intelligent query invalidation based on dependency analysis.

**What we implemented**:
- `QueryInvalidationManager` for rule-based invalidation
- Smart invalidation that considers query specificity
- Confidence levels for invalidation decisions
- Statistics tracking for debugging

**Example**:
```typescript
// Register invalidation rules:
QueryInvalidationManager.registerRule(
  'user-task-assignee',
  'users',
  ['tasks-with-assignee'],
  {
    condition: (userDoc, queryParams) => queryParams.populate?.assignee,
    priority: 'high'
  }
)
```

## 5. **Key Architectural Insights**

### **Convex Approach**:
- **Server-side re-execution**: Queries are re-run on the server when dependencies change
- **Full query results**: Sends complete updated results to clients
- **Automatic dependency detection**: No explicit configuration needed

### **Zero Sync Approach**:
- **Client-side re-evaluation**: Incremental updates sent, queries re-evaluated locally
- **Bandwidth efficient**: Only sends specific changes, not full results
- **Schema-based relationships**: Dependencies defined in schema

### **Our Hybrid Approach**:
- **Incremental updates with optimization**: Send targeted changes when possible
- **Fallback to full refresh**: Ensures correctness when optimization fails
- **Automatic dependency tracking**: Extract dependencies from query structure
- **Population consistency**: Ensure related data is properly populated

## 6. **Performance Benefits**

1. **Reduced Database Load**: Only fetch affected documents instead of full query results
2. **Improved Bandwidth**: Send targeted updates instead of complete refreshes
3. **Better Scalability**: Dependency tracking scales with query complexity, not data size
4. **Faster Updates**: Cross-collection changes propagate more efficiently

## 7. **Usage Example**

```typescript
// Client code remains the same:
const [tasks] = usePayloadQuery({
  type: 'find',
  collection: 'tasks',
  populate: { assignee: true },
  where: { status: 'active' }
})

// But now when a user's name changes:
// ✅ System automatically detects the dependency
// ✅ Only fetches affected tasks (not all tasks)
// ✅ Sends targeted updates to client
// ✅ UI updates reactively with new assignee names
```

## 8. **Debugging and Monitoring**

New debugging capabilities:
- `getDependencyStats()` - View dependency mappings
- `getSubscriptionStats()` - Monitor active subscriptions
- `QueryInvalidationManager.getStats()` - Track invalidation patterns
- Enhanced logging for cross-collection updates

## 9. **Future Improvements**

Based on this foundation, we could add:
- **Smarter batching**: Group related updates together
- **Conflict resolution**: Handle concurrent updates more gracefully
- **Schema-aware optimization**: Use PayloadCMS schema for better dependency detection
- **Caching layers**: Add intelligent caching for frequently accessed relationships

This implementation brings payload-sync much closer to the sophisticated real-time sync capabilities of Convex and Zero Sync while maintaining compatibility with PayloadCMS architecture.
