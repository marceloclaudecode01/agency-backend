import { Request, Response } from 'express';
import { TasksService } from './tasks.service';
import { ApiResponse } from '../../utils/api-response';

const tasksService = new TasksService();

export class TasksController {
  async findAll(req: Request, res: Response) {
    try {
      const tasks = await tasksService.findAll(req.query as any);
      return ApiResponse.success(res, tasks);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch tasks');
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const task = await tasksService.findById(req.params.id as string);
      return ApiResponse.success(res, task);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to fetch task');
    }
  }

  async create(req: Request, res: Response) {
    try {
      const task = await tasksService.create(req.body);
      return ApiResponse.created(res, task, 'Task created successfully');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to create task');
    }
  }

  async update(req: Request, res: Response) {
    try {
      const task = await tasksService.update(req.params.id as string, req.body);
      return ApiResponse.success(res, task, 'Task updated successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to update task');
    }
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const task = await tasksService.updateStatus(req.params.id as string, req.body.status);
      return ApiResponse.success(res, task, 'Task status updated successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to update task status');
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await tasksService.delete(req.params.id as string);
      return ApiResponse.success(res, null, 'Task deleted successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to delete task');
    }
  }
}
