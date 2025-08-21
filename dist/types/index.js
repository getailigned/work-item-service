"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LineageRelationType = exports.WorkItemPriority = exports.WorkItemStatus = exports.WorkItemType = void 0;
var WorkItemType;
(function (WorkItemType) {
    WorkItemType["OBJECTIVE"] = "objective";
    WorkItemType["STRATEGY"] = "strategy";
    WorkItemType["INITIATIVE"] = "initiative";
    WorkItemType["TASK"] = "task";
    WorkItemType["SUBTASK"] = "subtask";
})(WorkItemType || (exports.WorkItemType = WorkItemType = {}));
var WorkItemStatus;
(function (WorkItemStatus) {
    WorkItemStatus["DRAFT"] = "draft";
    WorkItemStatus["PLANNED"] = "planned";
    WorkItemStatus["IN_PROGRESS"] = "in_progress";
    WorkItemStatus["BLOCKED"] = "blocked";
    WorkItemStatus["REVIEW"] = "review";
    WorkItemStatus["COMPLETED"] = "completed";
    WorkItemStatus["CANCELLED"] = "cancelled";
})(WorkItemStatus || (exports.WorkItemStatus = WorkItemStatus = {}));
var WorkItemPriority;
(function (WorkItemPriority) {
    WorkItemPriority["CRITICAL"] = "critical";
    WorkItemPriority["HIGH"] = "high";
    WorkItemPriority["MEDIUM"] = "medium";
    WorkItemPriority["LOW"] = "low";
})(WorkItemPriority || (exports.WorkItemPriority = WorkItemPriority = {}));
var LineageRelationType;
(function (LineageRelationType) {
    LineageRelationType["CONTAINS"] = "contains";
    LineageRelationType["SUPPORTS"] = "supports";
    LineageRelationType["DERIVED_FROM"] = "derived_from";
})(LineageRelationType || (exports.LineageRelationType = LineageRelationType = {}));
//# sourceMappingURL=index.js.map