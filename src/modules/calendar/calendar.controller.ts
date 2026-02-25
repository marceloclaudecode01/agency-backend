import { Request, Response } from 'express';
import { CalendarService } from './calendar.service';
import { ApiResponse } from '../../utils/api-response';

const calendarService = new CalendarService();

export class CalendarController {
  async findAll(req: Request, res: Response) {
    try {
      const events = await calendarService.findAll(req.query as any);
      return ApiResponse.success(res, events);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch events');
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const event = await calendarService.findById(req.params.id as string);
      return ApiResponse.success(res, event);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to fetch event');
    }
  }

  async create(req: Request, res: Response) {
    try {
      const event = await calendarService.create(req.body);
      return ApiResponse.created(res, event, 'Event created successfully');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to create event');
    }
  }

  async update(req: Request, res: Response) {
    try {
      const event = await calendarService.update(req.params.id as string, req.body);
      return ApiResponse.success(res, event, 'Event updated successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to update event');
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await calendarService.delete(req.params.id as string);
      return ApiResponse.success(res, null, 'Event deleted successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to delete event');
    }
  }
}
