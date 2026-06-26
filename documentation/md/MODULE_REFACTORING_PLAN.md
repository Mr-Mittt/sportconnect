# Module Refactoring Plan

## Objective
Rename social modules to post modules, then create new group modules under social.

## Current Structure
```
modules/
└── social/
    ├── social-api/
    └── social-impl/
```

## Target Structure
```
modules/
└── social/
    ├── post-api/      (renamed from social-api)
    ├── post-impl/     (renamed from social-impl)
    ├── group-api/     (new)
    └── group-impl/    (new)
```

## Refactoring Steps

### Phase 1: Rename Modules
1. Rename `social-api` → `post-api`
2. Rename `social-impl` → `post-impl`

### Phase 2: Update References
1. `settings.gradle` - module includes
2. `server/build.gradle` - dependencies
3. All `build.gradle` files that reference social modules
4. Package names in Java files
5. Import statements across codebase

### Phase 3: Create New Modules
1. Create `group-api` module structure
2. Create `group-impl` module structure
3. Add to `settings.gradle`
4. Create build.gradle files
5. Create Java entities

## Files to Update

### Configuration Files
- `settings.gradle`
- `server/build.gradle`
- `modules/social/post-impl/build.gradle` (after rename)

### Java Package Renames
- `com.sportconnect.social.api` → `com.sportconnect.post.api`
- `com.sportconnect.social` → `com.sportconnect.post`

### Import Updates Needed In
- All controllers
- All services
- All DTOs
- Client API calls (if any reference package names)

## Risk Assessment
- **High Risk**: Breaking existing functionality
- **Mitigation**: Systematic approach, test after each phase
- **Rollback**: Git commit before starting

## Execution Order
1. Create backup/commit
2. Rename directories
3. Update settings.gradle
4. Update all build.gradle files
5. Rename Java packages
6. Update imports
7. Create new group modules
8. Test compilation
